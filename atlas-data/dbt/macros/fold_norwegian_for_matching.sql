{% macro fold_norwegian_for_matching(column) %}
{#
  Uppercase, then map Æ/Ø/Å to plain ASCII letters, for NAME-MATCHING KEYS
  ONLY — never for a stored or displayed value.

  Checked before writing this: no existing macro does this (grepped
  macros/*.sql and every model using translate() — only dim_activity.sql's
  slug generator, a different purpose: ASCII-safe ids, not match keys).

  🔴 Unicode NFD does not decompose Æ/Ø/Å — they are base letters in
  Norwegian, not accented composites, so Postgres's own unaccent() and a
  naive NFD normalize both leave them untouched. `brreg-chapter-matching.md`
  rule 1: a pattern written for "RODE KORS" matches 0 of 383 "RØDE KORS"
  units, silently, unless the compared text is folded the same way first.

  Applied to BOTH sides of a comparison (the registry name here, and the
  include/exclude/strong patterns in ref_atlas_ngo_match_rule.csv, which are
  authored already-folded — e.g. "RODE KORS" not "RØDE KORS") so the fold is
  symmetric and a pattern author cannot silently un-fold one side by typing
  a real Ø.
#}
  upper(translate({{ column }}, 'ÆØÅæøå', 'EOAEOA'))
{% endmacro %}
