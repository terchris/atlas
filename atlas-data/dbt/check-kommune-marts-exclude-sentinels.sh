#!/usr/bin/env bash
#
# Every published relation whose grain is "one row per kommune" must exclude
# SSB's 9999 'Uoppgitt'.
#
# 🔴 WHY THIS EXISTS. Terje's decision on urb-agents #1301 (2026-09-21) was
# option B: dim_kommune KEEPS 9999, because Klass 131 publishes it and Atlas
# does not drop what SSB publishes, while the analytical marts exclude it
# because their grain is a municipality and 9999 is not one.
#
# The objection to that split is that it is a filter in five places instead of
# one, so a mart added later can forget. This is the answer to that objection.
# The list is DERIVED from the dbt manifest — every model in models/marts/api/
# documenting a kommune_nr column is checked, including ones not yet written.
#
# ⚠️ WHY A SHELL GATE AND NOT A dbt TEST. I wrote the dbt test first. It built
# its model list from `graph`, which is empty during parse, so it registered no
# ref() calls, so dbt inferred no parents, so dagster-dbt would have made no
# asset check from it and NOTHING WOULD HAVE RUN IT. That exact failure is
# already documented in assets/api_v1.py: "in the manifest and executed are two
# different things". A gate that cannot be forgotten beats a test that can.
#
# ⚠️ Static text matching, so it is a floor: it proves the filter is WRITTEN,
# not that it WORKS. What it catches is the failure this split introduces — a
# new mart that never considered the question.
#
# ⚠️ No `mapfile` (bash 4+; macOS ships 3.2) and no `mktemp -t` (BSD-only). The
# neighbouring gate shipped the latter and died on its first CI run.
set -euo pipefail
cd "$(dirname "$0")"

MANIFEST=target/manifest.json
[ -f "$MANIFEST" ] || { echo "✗ CANNOT CHECK: no $MANIFEST — run 'dbt parse' first." >&2; exit 2; }

# Named with reasons, because a gate that is mostly exemptions is a list
# wearing a rule's clothes.
#   mart_dim_kommune             deliberately keeps it; it mirrors Klass 131
#   mart_unattributed_totals     reports the remainder; the sentinel is its
#                                subject, so filtering it would empty the view
#   mart_brreg_enhet             VERBATIM register mirror. Its grain is one row
#                                per organisation and kommune_nr is an
#                                attribute of that organisation, not the grain.
#                                Filtering it would curate Brreg's own register,
#                                which is the thing this repo does not do.
#   mart_distrikt_summary        grain is chapters. kommune_nr is a
#   mart_kommune_local_chapters  dim_postnummer lookup on a chapter's postal
#                                address and cannot be 9999.
#   mart_dim_postnummer          IT IS THE LOOKUP THE TWO ABOVE ARE EXEMPT FOR.
#                                Grain is one row per postal code; kommune_nr
#                                is the attribute, not the grain. Bring's
#                                register contains ZERO 9999 rows (counted in
#                                the seed, 2026-09-25) — so a filter here would
#                                remove nothing today, and on the day upstream
#                                did emit one it would silently DROP A POSTAL
#                                CODE from a register Atlas republishes
#                                verbatim. That is editing source data to
#                                satisfy a gate.
#
# 🔴 SEVEN PER-SOURCE INDICATOR RELATIONS ARE EXEMPT AS A RECORDED DEFECT, NOT
# AS A JUDGEMENT THAT THEY ARE FINE. This is the one group here whose exemption
# means "known wrong, decision pending" rather than "the rule does not apply".
#
#   Six derive kommune_nr with a BARE four-digit match:
#     case when <col> ~ '^[0-9]{4}$' then <col> end as kommune_nr
#   That is the exact expression indicators__ssb_07459 carries a 🔴 warning
#   against in its own file -- "it called Svalbard, Jan Mayen, the continental
#   shelf and the 19 uoppgitt-kommune codes municipalities: 47 codes, 9 964
#   rows". Twenty sibling models were migrated to region_code_to_kommune_nr;
#   these six were not.
#     mart_indicators__bufdir_barnefattigdom  mart_indicators__fhi_bor_alene
#     mart_indicators__fhi_mobbing            mart_indicators__fhi_trangbodd
#     mart_indicators__fhi_vgs_gjennomforing  mart_indicators__ssb_08764
#
#   One is bydel-derived (left(<col>, 4) over a 6-digit code) and merely
#   unproven rather than known wrong:
#     mart_indicators__ssb_10826
#
# ⚠️ WHAT IS NOT KNOWN, and it is the whole decision: whether those codes are
# PRESENT in each source. That needs the warehouse, which this agent cannot
# reach -- `select source_id, count(*) from marts.indicators__x where
# kommune_nr = '9999' or kommune_nr like '21%' group by 1`. A code path is not
# a data claim.
#
# 🔵 The fix, if the answer is yes, is the one already applied twenty times and
# explicitly sanctioned in CLAUDE.md: correcting a DERIVATION is Atlas getting
# its own column right, not editing source data. It is NOT done here because it
# changes values in relations that are already published, which is a deploy
# with its own acceptance checks -- not a side effect of a publish. Raised on
# urb-agents #1547.
EXEMPT="mart_dim_kommune mart_unattributed_totals mart_brreg_enhet mart_distrikt_summary mart_kommune_local_chapters mart_dim_postnummer mart_indicators__bufdir_barnefattigdom mart_indicators__fhi_bor_alene mart_indicators__fhi_mobbing mart_indicators__fhi_trangbodd mart_indicators__fhi_vgs_gjennomforing mart_indicators__ssb_08764 mart_indicators__ssb_10826"

CANDIDATES="$(./.venv/bin/python -c '
import json, sys
m = json.load(open("target/manifest.json"))
for n in m["nodes"].values():
    if (n["resource_type"] == "model"
            and "/marts/api/" in n["original_file_path"]
            and "kommune_nr" in n.get("columns", {})):
        print(n["name"], n["original_file_path"])
')"

[ -n "$CANDIDATES" ] || { echo "✗ CANNOT CHECK: zero models matched — it would have passed without checking anything." >&2; exit 2; }

missing=""
checked=0
skipped=0
while IFS=' ' read -r name path; do
  [ -n "$name" ] || continue
  case " $EXEMPT " in *" $name "*) skipped=$((skipped+1)); continue ;; esac
  checked=$((checked+1))
  # A sentinel filter, a kommune_nr that is null by construction, or it reads a
  # relation that already filters. All three are stated in the file itself.
  #
  # ⚠️ A BARE PASSTHROUGH INHERITS ITS PARENT'S ANSWER, and the text is in the
  # PARENT'S file, not this one. The 40 published per-source indicator relations
  # are `select * from {{ ref('indicators__x') }}` — they cannot add or remove a
  # filter, so asking whether THEY mention one is asking the wrong file. Each
  # parent derives kommune_nr through region_code_to_kommune_nr, which is the
  # null-by-construction case already accepted above.
  #
  # 🔵 Narrow on purpose: the parent is consulted ONLY when the body really is a
  # bare `select *` over one ref(). Anything that projects, filters or joins is
  # judged on its own text, because then it CAN differ from its parent. The
  # alternative was 40 lines of EXEMPT, which is the list-wearing-a-rule's-
  # clothes failure this script warns about at the top.
  # Resolve a bare passthrough to its parent. No bash regex: macOS ships bash
  # 3.2 and the escaping for a quoted ref() inside [[ =~ ]] is where the first
  # attempt died. sed strips comments, tr flattens, grep extracts.
  search="$path"
  flat="$(sed 's/--.*//' "$path" | tr '\n' ' ' | tr -s ' ')"
  case "$flat" in
    *"select * from {{ ref("*)
      parent_name="$(printf '%s' "$flat" | grep -oE "ref\('[a-z0-9_]+'\)" | head -1 \
                     | sed "s/ref('//; s/')//")"
      if [ -n "$parent_name" ]; then
        parent="$(find models -name "${parent_name}.sql" -print -quit 2>/dev/null)"
        [ -n "$parent" ] && search="$path $parent"
      fi
      ;;
  esac
  # ⚠️ TWO MORE IDIOMS THAT PROVABLY EXCLUDE 9999, added 2026-09-25 when the 40
  # per-source indicator relations were published and this gate flagged 20 of
  # them. Neither is a loophole; both are the filter, written differently:
  #
  #   right(<col>, 2) <> '99'   ten SSB models. Written to drop SSB's XX99
  #                             rest-of-fylke aggregates ("0199 = Rest of
  #                             Østfold"), and 9999 ends in 99, so the sentinel
  #                             goes with them. ssb_06944 says so in its own
  #                             comment.
  #   null::text as kommune_nr  the three national crime tables. The column is
  #                             literally always NULL; no code can reach it.
  #
  # 🔵 Deliberately NOT accepting `left(<col>, 4)` (ssb_10826, bydel-derived).
  # It probably never yields 9999, and probably is not the standard this gate
  # exists to hold — '999900' would produce it. It is flagged instead.
  if ! grep -qE "is_sentinel|region_code_to_kommune_nr|mart_kommune_ngo_summary|postal lookup|right\([^)]*, *2 *\) *<> *'99'|null::text +as +kommune_nr" $search; then
    missing="${missing}    ${name}  (${path})
"
  fi
done <<CANDIDATE_LIST
$CANDIDATES
CANDIDATE_LIST

if [ -n "$missing" ]; then
  echo "✗ a published per-kommune relation does not exclude SSB's 9999 sentinel."
  echo "  Filter it, or add it to EXEMPT in this script WITH A REASON."
  printf '%s' "$missing"
  exit 1
fi

echo "✓ all ${checked} published per-kommune relations exclude the 9999 sentinel"
echo "  (${skipped} exempt by name and reason; list derived from the dbt manifest)"
