{#
  Recreate this model's api_v1 wrapper view immediately after the model is built.

  🔴 WHY THIS EXISTS — the public API used to go dark during every transform.

  dbt's table materialization does not replace a table in place. From
  dbt-core's own `materializations/models/table.sql`:

      line 42   rename_relation(existing_relation, backup_relation)
      line 46   rename_relation(intermediate_relation, target_relation)
      line 59   drop_relation_if_exists(backup_relation)

  and `macros/relations/table/drop.sql` drops with `cascade`.

  ⚠️ The rename is the half that is easy to miss. A Postgres view binds to a
  table's OID, not its name — so at line 42 `api_v1.<x>` silently FOLLOWS its
  mart into `mart_<x>__dbt_backup` and keeps answering from the outgoing copy.
  Line 59 then destroys it with `cascade`.

  Measured by imac on 2026-09-13 (urb-agents #786) during an ordinary, SUCCESSFUL
  run: `api_v1` fell 14 → 10 → 9 → 8 → 4 → 0, and a consumer of
  `GET /brreg_enhet` received **404 for seventy seconds**. `apply-api-v1.sh` put
  everything back at the end, so nothing looked wrong afterwards.

  🔴 And the worse half is not the window. A run that FAILS partway leaves every
  view it had already torn down missing, with no time limit — thirteen public
  endpoints at 404 until a human notices. Recreating the view here means a run
  that dies at model 40 leaves the first 39 serving.

  WHAT THIS DOES NOT DO

  ⚠️ It is not atomic. Postgres cannot swap a table and its dependents in one
  visible step, so a sub-second window per view remains between the cascade and
  this hook. Closing it entirely means PostgREST reading from something that is
  never dropped — a larger design change, deliberately not attempted here.

  ⚠️ The COMMENT is not restored by this hook, so a view recreated here serves
  correct data without its documentation until `apply-api-v1.sh` puts it back.
  PostgREST sources the OpenAPI descriptions from those comments, so the docs —
  not the data — go thin.

  🔴 "BRIEFLY" IS WRONG AND THIS NOTE USED TO SAY IT. On a SUCCESSFUL run the gap
  closes at the apply step, which is the case this paragraph was written for. On a
  FAILED run there is no apply step, so the comments stay missing until the next
  successful one — open-ended, not sub-second. imac measured exactly that on
  urb-agents #788: after a failed run all 14 views had lost their comments and the
  OpenAPI descriptions were empty.

  🔵 The guarantee is therefore **"a successful transform lands comments"**, not
  "comments are always current" (imac's phrasing, urb-agents #825). Thin is a
  better failure than stale — an empty description is visibly missing where wrong
  text reads as authoritative — but the distinction only helps someone who knows
  it is empty rather than believing it is brief.

  ✅ What #825 also established, since it is the neighbouring worry: the apply path
  DOES reach the served document. `generate_api_v1.py` emits
  `NOTIFY pgrst, 'reload schema'` as its last statement, and after a successful
  transform a corrected comment is present in `pg_description` AND in the served
  OpenAPI, with no stale copy anywhere. PostgREST's schema cache does not swallow
  a comment change on this path.

  Guarded on the schema existing, so a build against a database where migration
  050 has not yet run degrades to a no-op rather than failing the model. The same
  defensive shape `api_v1_generated.sql` already uses for its grants.

  Grants need no repetition here: `configure postgrest` sets
  `ALTER DEFAULT PRIVILEGES IN SCHEMA api_v1 GRANT SELECT ON TABLES TO
  <app>_web_anon`, which covers views created later by the same role.
#}

{% macro restore_api_v1_view() %}
  {%- if execute and this.identifier.startswith('mart_') -%}
    {%- set view_name = this.identifier[5:] -%}
    do $$
    begin
      if exists (select 1 from pg_namespace where nspname = 'api_v1') then
        execute 'create or replace view api_v1.{{ view_name }} as select * from {{ this }}';
      end if;
    end $$
  {%- else -%}
    select 1
  {%- endif -%}
{% endmacro %}
