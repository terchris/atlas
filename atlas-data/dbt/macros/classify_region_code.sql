{#
  What an SSB region code IS, from the code alone.

  🔴 THE DEFECT THIS FIXES. Indicator models wrote

      case when region_code ~ '^[0-9]{4}$' then region_code end as kommune_nr

  which calls ANY four-digit region code a kommune. SSB's Region dimension is
  not only kommuner: `2101` is Longyearbyen on Svalbard, `2311` is a sector of
  the continental shelf, and `0199` means "somewhere in Østfold, municipality
  not specified". None of them is a municipality, and Atlas was labelling all
  of them as one — which is why 47 codes produce permanent referential warnings
  against dim_kommune (urb-agents #700, INVESTIGATE-ssb-pseudo-regions).

  ✅ TERJE'S DECISION, 2026-09-21: represent these regions, do not cover them.
  So the fix is not to invent dim_kommune rows for places SSB does not consider
  municipalities. It is to stop claiming they are municipalities. A code that is
  not a kommune gets a null kommune_nr and a named region_kind, and the warning
  resolves because the assertion under it becomes true.

  🔴 `9999` IS THE ONE THIS ALMOST GOT WRONG, AND IT IS THE SENTINEL FROM
  DECISION 2 OF THE SAME TASK. It matches the XX99 pattern, so without its own
  branch it classifies as "unspecified within fylke 99" — and there is no fylke
  99. It is SSB's NATIONAL "Uoppgitt" bucket. Caught by running the classifier
  against the known code families rather than by reading it.

  ⚠️ Note what it also says: `9999` is NOT a kommune. `dim_kommune` carries it
  as a row with `is_active = true`, which is the trap `is_sentinel` was shipped
  to make nameable. This macro is the second surface to say so, and the two now
  agree.

  ⚠️ ORDER MATTERS AND 2199 IS WHY. `2199` matches both the Svalbard range and
  the XX99 "unspecified" pattern. SSB lists it under Svalbard, so Svalbard is
  tested first. Reordering these branches silently reclassifies it.

  🔵 A RULE RATHER THAN A LIST OF 47 CODES, DELIBERATELY. The investigation
  enumerated the codes present on 2026-09-06. A seed of those 47 would be a
  snapshot: it goes stale when SSB adds a shelf sector, and — worse — it would
  have to be typed from a table in a markdown file, which is how a code that
  does not exist gets asserted into a dimension. The patterns are SSB's own
  structure; `seeds/ref_region_kind.csv` carries them as reference data so a
  consumer can read what each kind means, and this macro is the single place
  that applies them.

  ⚠️ `unknown` is emitted rather than defaulted to kommune. A region code that
  matches nothing here is a new upstream shape, and it should be visible as
  such instead of quietly becoming a municipality — which is the whole defect,
  one layer along.

  🔴 AND IT MUST EXIST IN ref_region_kind. I wrote this branch and left the row
  out of the seed, so the first time the dbt check suite ran, the relationships
  test failed on 24 178 rows across ten models (urb-agents #1313). Nothing
  reached a consumer — every `unknown` row carries a null kommune_nr — but the
  suite was red every night and nobody would have known, because
  transform_and_publish runs `dbt build --exclude-resource-type test`.

  ✅ IT WAS A BAG AND IT HAS BEEN EMPTIED. I hypothesised bydel and nasjon from
  FHI's own documentation of GEO; imac measured it (urb-agents #1315) and it is
  exactly those two and nothing else:

      6-digit (bydel)   36 distinct codes   1 080 rows
      "0"     (nasjon)   1 code                30 rows

  Both now have their own branch, so `unknown` should match nothing today. The
  member stays, and so does the gate — a residual category that currently
  catches nothing is the point of having one.

  🔴 AND THE BYDEL ROWS MATTER MORE THAN THE TIDINESS. imac joined the 6-digit
  prefixes to mart_dim_kommune:

      0301 Oslo 15 sub-codes · 1103 Stavanger 9 · 4601 Bergen 8

  The demo consumer has been arguing for days that Oslo's need index of 62.7 is
  an average over districts that differ enormously, and asking for ssb-10826 to
  get bydel-level data. ⚠️ Ungdata has been carrying bydel rows for three of
  those cities the whole time, and Atlas was discarding them into `unknown`.

  ⚠️ NAMING THEM IS NOT PUBLISHING THEM. These rows still have no home: every
  published relation is keyed on kommune_nr, and region_code_to_kommune_nr
  correctly returns null for a bydel. A bydel surface needs its own mart and
  its own grain decision — the same decision ssb-10826 has been waiting on.
  What changes is that it is no longer "ingest a bydel source"; it is "two
  sources already in raw carry bydel rows and neither has anywhere to put
  them".
#}
{% macro classify_region_code(col) -%}
  case
    when {{ col }} = '0' then 'nasjon'
    when {{ col }} = '9999' then 'unspecified_national'
    when {{ col }} ~ '^21\d{2}$' then 'svalbard'
    when {{ col }} ~ '^22\d{2}$' then 'jan_mayen'
    when {{ col }} ~ '^23\d{2}$' then 'continental_shelf'
    when {{ col }} ~ '^\d{6}$' then 'bydel'
    when {{ col }} ~ '^\d{2}99$' then 'unspecified_within_fylke'
    when {{ col }} ~ '^\d{4}$'   then 'kommune'
    when {{ col }} ~ '^\d{2}$'   then 'fylke'
    else 'unknown'
  end
{%- endmacro %}

{#
  The kommune_nr a region code yields — null unless it really is a kommune.
  Every indicator model should derive kommune_nr through this rather than
  through a bare four-digit regex.
#}
{% macro region_code_to_kommune_nr(col) -%}
  case when ({{ classify_region_code(col) }}) = 'kommune' then {{ col }} end
{%- endmacro %}
