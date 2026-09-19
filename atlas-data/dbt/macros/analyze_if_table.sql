{#-
  ANALYZE a relation we just rebuilt — but only if it is actually a table.

  🔴 WHY THIS IS A MACRO AND NOT `+post-hook: "analyze {{ this }}"`.

  The first version of this fix put that literal hook on the three
  table-materialised directories. The manifest disagreed with the intent in
  BOTH directions:

      SPURIOUS  mart_source_freshness, mart_ingest_health, mart_brreg_enhet
                — views inside a table-materialised directory, so they would
                  have been ANALYZEd. Postgres answers that with a WARNING on
                  every run, and a warning on every run is how a log stops
                  being read.
      MISSED    the four private_marts frr_* tables, which live outside those
                directories and would have kept the stale statistics this
                change exists to remove.

  Directory is a proxy for materialisation and it is a leaky one. This asks the
  model what it is, so a model that changes materialisation later gets the
  right treatment without anyone remembering this file exists.

  ⚠️ `select 1` rather than an empty string: an empty hook is not reliably a
  no-op, and a trivial query on the ten view models costs nothing measurable.
-#}
{% macro analyze_if_table() %}
  {#- `model.config.materialized` rather than `config.get(...)`: both are
      documented in a hook context, but the manifest proves the first one is
      populated for every node here, and hook execution cannot be tested
      without a database. Prefer the one with evidence. -#}
  {%- set mat = model.config.materialized -%}

  {#- 🔴 AN UNREADABLE MATERIALISATION MUST NOT LOOK LIKE A VIEW.
      Jinja evaluates `Undefined in (...)` as FALSE, so if this context ever
      stops exposing model.config the macro would quietly emit `select 1` for
      every model, analyse nothing, and leave the exact stale statistics it was
      added to remove — green, silent, and wrong. That is the same shape as the
      documentation gate that reported success when it had checked nothing
      (urb-agents #1039). Fail instead. -#}
  {%- if mat is not defined or not mat -%}
    {{ exceptions.raise_compiler_error(
         "analyze_if_table: cannot read model.config.materialized for " ~ this ~
         ". Refusing to skip ANALYZE silently — see macros/analyze_if_table.sql.") }}
  {%- endif -%}

  {%- if mat in ('table', 'incremental') -%}
    analyze {{ this }}
  {%- else -%}
    select 1
  {%- endif -%}
{% endmacro %}
