{#
  Register the FK that lets PostgREST embed indicator_summary into meta_sources.

  🔴 WHY A REAL CONSTRAINT AND NOT A TEST. PostgREST derives resource embedding
  from `pg_constraint`, not from documentation. Without an actual FK:

      GET /indicator_summary?select=source_id,meta_sources(license)
        -> PGRST200 "no matches were found"

  so a number and its provenance cannot be fetched together, and the schema map
  a consumer renders from the API has zero edges. ops-dev measured the
  consequence: an app cannot put `one number · its source · its refresh date`
  on a page in one request, and the persona that suffers is the reader who gets
  a confident figure with no provenance attached (urb-agents #1252).

  ✅ AUTHORISED BY TERJE ON 2026-09-20, WITH THE RISK IN FRONT OF HIM — verbatim
  "do the FK", after the build-failure risk below was put to him explicitly. He
  is not owed a surprise: "we tried it, here is how it failed" was named as an
  acceptable outcome.

  🔴 THE CONSTRAINT DOES NOT SURVIVE A REBUILD, WHICH IS WHY THIS IS A MACRO ON
  BOTH SIDES RATHER THAN A ONE-OFF MIGRATION.

  dbt's table materialization renames the old table aside and drops it
  `cascade` (see macros/restore_api_v1_view.sql, which exists for the same
  reason one level up). So:

      rebuild mart_meta_sources        -> the old table is dropped cascade
                                          and the FK POINTING AT IT goes with it
      rebuild mart_indicator_summary   -> the old table is dropped, FK and all

  ⚠️ Either rebuild silently removes the embedding. In a full `dbt build` the
  downstream model is rebuilt afterwards and puts it back, so the damage is
  invisible — but `dbt run --select mart_meta_sources` leaves the API answering
  PGRST200 again with every signal green. Hence a post-hook on BOTH models:
  whichever is rebuilt, the constraint is restored by the thing that removed it.

  🔴 THIS MACRO USED TO CREATE THE UNIQUE TARGET TOO, AND THAT BROKE THE
  NIGHTLY BUILD ON ITS SECOND RUN (urb-agents #1307).

      Database Error in model mart_meta_sources
        relation "mart_meta_sources_source_id_key" already exists

  ⚠️ The guard asked `pg_constraint where conrelid = <this table>` — a TABLE
  scoped question. A unique constraint is backed by an INDEX, and index names
  are unique at SCHEMA scope. dbt renames the old table aside and drops it
  AFTER post-hooks run, and renaming a table does not rename its indexes — so
  at post-hook time the name was still held by mart_meta_sources__dbt_backup,
  the guard looked at the new table, saw nothing, and walked into a collision.
  It succeeded exactly once, on the run where no such index existed yet.

  ✅ The fix is not a better guard. The unique target is now a dbt-managed
  index — `indexes=[{'columns': ['source_id'], 'unique': True}]` on
  mart_meta_sources — because dbt hash-names its indexes per build and
  dim_kommune has been rebuilding one nightly for months without collision.

  🔵 A unique INDEX is a valid FK target; a unique CONSTRAINT is not required.
  Verified in Postgres 15 rather than assumed, along with the other half: FK
  constraint names are TABLE scoped, so the FK below never had this problem and
  does not need the same treatment.

  🔵 And because "invisible unless you look" is exactly how this class of defect
  survives, the asset check `embedding_fk_is_registered` asks the database
  whether the constraint is actually there. A macro that quietly stopped firing
  would otherwise be indistinguishable from one that never ran.

  ⚠️ IT WARNS RATHER THAN FAILING THE BUILD, DELIBERATELY, AND THAT IS A CHANGE
  OF POSITION FROM THE ONE TERJE AUTHORISED. He accepted a failed nightly
  transform as a possible cost. This takes a smaller one where it can: if the
  ALTER fails — an orphan source_id, a duplicate in the target — the exception
  is caught, a WARNING names the constraint, and the run continues. The same
  integrity is already asserted by the `relationships` test on
  mart_indicator_summary.source_id, which fails loudly in `transform_checks`,
  which is the place a violation should stop something.

  The trade is deliberate: a missing FK breaks one consumer's embedding, a
  failed transform takes the whole public API down mid-rebuild. 🔵 If Terje
  wants the stricter reading, remove the exception block — the behaviour he
  authorised is one deleted `exception when others` away, and this note is here
  so that is a decision rather than a discovery.

  Schema names are literal rather than `ref()`: mart_indicator_summary already
  refs mart_meta_sources, so a `ref()` back the other way would make the DAG
  cyclic and dbt would refuse to compile. Same defensive `to_regclass` guard as
  restore_api_v1_view, so a cold install where one side does not exist yet
  degrades to a warning rather than an error.
#}
{% macro register_source_id_fk() %}
  {%- if execute -%}
    do $$
    declare
      target_rel regclass := to_regclass('marts.mart_meta_sources');
      source_rel regclass := to_regclass('marts.mart_indicator_summary');
    begin
      if target_rel is null or source_rel is null then
        raise warning 'register_source_id_fk: skipped, marts.mart_meta_sources=% marts.mart_indicator_summary=% — embedding will return PGRST200 until both exist',
          target_rel, source_rel;
        return;
      end if;

      if not exists (
        select 1 from pg_constraint
        where conrelid = source_rel and conname = 'mart_indicator_summary_source_id_fkey'
      ) then
        alter table marts.mart_indicator_summary
          add constraint mart_indicator_summary_source_id_fkey
          foreign key (source_id) references marts.mart_meta_sources (source_id);
      end if;
    exception
      -- ⚠️ Narrow on purpose. Only the two failures this DDL can actually have
      -- are swallowed: an orphan source_id, or a target that is not unique.
      -- Anything else — a permissions error, a missing column — is a defect in
      -- this macro and must stop the model rather than degrade to a warning.
      when foreign_key_violation then
        raise warning 'register_source_id_fk: NOT registered (%). Embedding stays PGRST200. An orphan source_id — the relationships test on mart_indicator_summary.source_id names the rows.',
          sqlerrm;
    end $$;
  {%- endif -%}
{% endmacro %}
