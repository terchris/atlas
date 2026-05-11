# Investigate: Reference & dimension tables — naming, structure, refresh

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Completed

**Goal**: Decide a single principled convention for **all reference/dimension tables Atlas will need** — what to name them, where they live in `marts.*`, how they refresh, and which authoritative sources own them — before we start sprinkling `dim_*` / `ref_*` / `dim_postnummer` / `ref_icnpo` / `vocab_*` ad-hoc as different investigations promote to PLANs.

**Last Updated**: 2026-04-23
**Completed**: 2026-04-23 — adopted Option A+D. Convention codified in [`docs/stack/naming-conventions.md`](https://github.com/terchris/atlas/tree/main/docs/stack/naming-conventions.md) via [PLAN-reference-tables-convention](../completed/PLAN-reference-tables-convention.md).

**Origin**: [INVESTIGATE-ngo-supply-data-model.md](INVESTIGATE-ngo-supply-data-model.md) is about to introduce 6+ new tables of this kind (`dim_postnummer`, `dim_ngo`, `ref_icnpo`, `ref_sdg`, `ref_service_category`, `crosswalk_*`). The user observed: we don't have a common name for this category, and we should pick one before the new tables land. This investigation establishes the rule once so every future addition follows it without case-by-case argument.

---

## Questions to Answer

1. What **categories of reference data** does Atlas have today and what will it likely add in v1 / v1.5?
2. Where do the authoritative copies live — Brreg, SSB Klass, UN, ISO, Atlas-curated, or a mix?
3. Is the current `dim_*` vs `ref_*` split the right rule, or do we need a third prefix?
4. How do we encode **ownership** in the table name (e.g. ICNPO is Brreg's; SDG is the UN's; sex enum is SSB's)?
5. What's the **refresh policy** per category — manual on schema change, scheduled, never?
6. How does this interact with the existing `seed-paths` config + the `regenerate-erd.sh` flow + `naming-conventions.md`?

---

## Current State

### What Atlas has now (after PLAN-001/002/003 of code-label investigation)

In `marts.*`:

| Table | Type | Source | Refresh |
|---|---|---|---|
| `dim_kommune` | spatial dimension | SSB Klass 131 (via `ssb-klass-kommuner` ingest) | Annual + at admin reforms |
| `dim_fylke` | spatial dimension | SSB Klass 104 (via `ssb-klass-fylker` ingest) | Annual + at admin reforms |
| `ref_ssb_family_type` | code-label decoder | SSB metadata for table 06083 | Manual (`refresh-seeds`) |
| `ref_ssb_household_type` | code-label decoder | SSB metadata for table 06944 | Manual |
| `ref_ssb_nivaa` | code-label decoder | SSB metadata for table 09429 | Manual |
| `ref_fhi_utdann` | code-label decoder | FHI metadata for tables 794/360 | Manual |
| `ref_fhi_innvkat` | code-label decoder | FHI metadata for table 360 | Manual |

**Two prefixes**: `dim_*` for spatial dimensions joined to facts, `ref_*` for small enums that decode upstream codes. Both work today. Question is whether they cover what's coming.

### What's about to be added (from open investigations)

From [INVESTIGATE-ngo-supply-data-model.md](INVESTIGATE-ngo-supply-data-model.md):

- `dim_ngo` — one row per NGO (orgnr keyed); joined to chapter/supply facts
- `dim_postnummer` — one row per (postnummer, kommune_nr); joined to NGO branches that publish only an address
- `ref_icnpo` — official 12+30 ICNPO classification (Brreg-owned); joined as taxonomy + rollup axis
- `ref_service_category` — Atlas-curated cross-NGO service vocabulary (~20 rows); joined as filter + rollup axis
- `crosswalk_kommune_name` — historical kommune names → kommune_nr (for fuzzy upstream resolution)
- `crosswalk_activity_to_category` — many-to-many: NGO local activity name → Atlas service category

That's three patterns the current convention doesn't cleanly handle:

- **`dim_postnummer`** — is it `dim_*` (joined to facts) or `ref_*` (decode-only, no metric)? Lean dim, but it's pure lookup data with no measurements.
- **`ref_icnpo`** — owned by Brreg, structurally a hierarchical taxonomy with parent/child rows, used both for filtering AND for sector rollups. Bigger and more permanent than the existing per-source `ref_ssb_*` enum decoders.
- **`crosswalk_*`** — neither `dim_*` nor `ref_*`. A new third pattern we haven't named.

### What's likely needed in v1.5+ (not blocking, but worth thinking about)

Based on existing research (`docs/research/data-sources*.md`, `ngo-landscape.md`, `goal.md`):

- `dim_country` — for international NGO work (Tier C donor-orgs operate in 30–50 countries each); ISO 3166 alpha-3, mappable to SSB Klass 91 (Land og statsborgerskap)
- `ref_brreg_organisasjonsform` — legal form codes (FLI, STI, AS, SA, FKF, ORGL); needed for filtering NGO type
- `ref_brreg_naeringskode` — NACE codes from SSB Klass 6; useful for cross-referencing with non-NGO orgs
- `dim_bydel` — bydel-level rows (Oslo, Bergen, Trondheim, Stavanger have these); some FHI/Bufdir indicators publish at bydel granularity
- `dim_sentralitet` (or attribute on `dim_kommune`) — SSB Klass 128 sentralitetsindeks; used in many comparative analyses
- `ref_un_sdg` — 17 UN Sustainable Development Goals (also 169 targets if we go deep); rollup axis for service categories
- `ref_iso_currency` — when funding data ingest happens (ISO 4217)
- `ref_helseregion` — 4 Norwegian health regions; used by Helsedirektoratet sources
- `ref_politidistrikt` — police districts; SSB Klass has the kommune→district correspondence

Some are obvious (we will need `dim_country` the moment we ingest a Tier C org). Others are speculative. The convention has to handle the obvious ones cleanly without forcing premature decisions on the rest.

### What the authoritative sources look like

Two registries handle most of this:

- **[Brønnøysundregistrene (Brreg)](https://data.brreg.no/enhetsregisteret/api/dokumentasjon/no/index.html)** — open API, free, no auth.
  - `/enhetsregisteret/api/enheter/{orgnr}` — every Norwegian org, including legal form, NACE code, kommune, registration status.
  - `/frivillighetsregisteret/api/frivillige-organisasjoner/{orgnr}` — voluntary orgs subset, with up to 3 ICNPO codes per org.
  - `/frivillighetsregisteret/api/icnpo-kategorier` — the canonical ICNPO category list itself.
- **[SSB Klass](https://www.ssb.no/klass/)** — open API, free, no auth. Hosts ~80 Norwegian classifications:
  - 131 Kommuneinndeling, 104 Fylkesinndeling
  - 488 Postnummer (with kommune correspondence)
  - 6 Næringsgruppering (Norwegian NACE)
  - 91 Land og statsborgerskap
  - 128 Sentralitet
  - 100 Helseregion, 22 Politidistrikt, …
  - Versioned by date; supports correspondence tables (crosswalks between classifications).

External standards (UN SDGs, ISO 3166, ISO 4217) come from non-Norwegian bodies but are stable enough to fetch once and pin in CSV.

Atlas-curated vocabulary (service categories, naming-conventions vocabulary) is owned by us — sourced from the team, not an external API.

---

## Options for the convention

### Option A — Keep `dim_*` and `ref_*`, refine the rule

Stick with the two prefixes Atlas already uses. Define the rule precisely:

- **`dim_*`** when the table is **joined as a dimension to a fact** (one row per natural key, FK constraints implicit via `relationships:` tests, often carries descriptive attributes alongside the key). Examples: `dim_kommune`, `dim_fylke`, `dim_postnummer`, `dim_ngo`, `dim_country`, `dim_chapter`.
- **`ref_*`** when the table is **a code-label or taxonomy lookup that decodes upstream codes or provides a controlled vocabulary**, and is not the primary join target of any fact. Examples: `ref_ssb_family_type`, `ref_brreg_icnpo`, `ref_un_sdg`, `ref_atlas_service_category`.

Crosswalks: introduce a third pattern, `crosswalk_<from>_<to>`, for explicit many-to-many or alternative-key mapping tables that don't fit either dim or ref.

**Pros**: minimal change. Honours existing tables. The rule is principled (join target vs. lookup) and easy to apply.
**Cons**: the `dim_postnummer` case is ambiguous — it has no facts of its own but is a join target between facts and `dim_kommune`. Defensible as `dim_*` because it carries the join.

### Option B — One prefix `ref_*` for everything; drop `dim_*`

Rename `dim_kommune` → `ref_kommune`, `dim_fylke` → `ref_fylke`, etc. One bucket, simpler mental model.

**Pros**: zero ambiguity.
**Cons**: throws away the Kimball-style distinction that experienced data folk recognise (a dimension is a thing facts hang from; a reference is a lookup decoder). Renames break existing models, fact_kommune_indicators tests, the ERD, the frontend's reads. Adds churn for negligible benefit.

Reject.

### Option C — Three prefixes: `dim_*`, `ref_*`, `std_*` (or `taxonomy_*`)

Introduce a third prefix for *external authoritative standards* (ICNPO, SDG, ISO codes), separating them from per-source decoders (`ref_ssb_*`).

**Pros**: visually separates "owned by an external standards body" from "owned by an upstream data source".
**Cons**: adds a third prefix to maintain. The line between "external standard" and "external code list" is fuzzy (is `ref_ssb_nivaa` not also a standard? It's the official Norwegian education classification). Three prefixes is one too many for the value gained.

Reject in favour of A.

### Option D — Encode ownership inside the existing prefix: `ref_<owner>_<concept>`

The existing convention is already `ref_ssb_family_type`, `ref_fhi_utdann` — owner is the second token. Extend uniformly:

- `ref_brreg_icnpo`
- `ref_brreg_organisasjonsform`
- `ref_un_sdg`
- `ref_iso_currency`
- `ref_atlas_service_category`

For dimensions there's no need to encode owner (kommune is unambiguously SSB-owned; postnummer is unambiguously Posten-owned). `dim_kommune`, `dim_postnummer` stay clean.

**Pros**: zero new prefixes. Owner is visible at table-name level. Easy to grep ("show me all Brreg-owned reference tables: `marts.ref_brreg_*`"). Consistent with the existing `ref_ssb_*` and `ref_fhi_*`.
**Cons**: slightly verbose. `ref_atlas_service_category` is one token longer than `ref_service_category`. Acceptable.

This is the natural extension of what's already there.

---

## Recommendation — Option A + D combined

**One sentence**: Use `dim_*` for join-target dimensions, `ref_<owner>_<concept>` for taxonomies/vocabularies/code-decoders, `crosswalk_<from>_<to>` for explicit cross-system mappings. Document the rule in `naming-conventions.md`.

**Rules:**

1. **`dim_*`** — used when the table is a **join target for facts**. One row per natural key. May carry descriptive attributes. Refresh policy: typically annual or on admin reform; tracked via an ingest source (e.g. `ssb-klass-kommuner`).
   - `dim_kommune`, `dim_fylke`, `dim_postnummer`, `dim_ngo`, `dim_chapter`, `dim_country`, `dim_bydel` (when added)
   - **Owner is implicit from context** — no second token needed. (If two systems publish competing kommune lists, deal with that case when it arises.)

2. **`ref_<owner>_<concept>`** — used for **taxonomies, vocabularies, code-label decoders**. Owner is the second token; concept follows. Refresh policy: manual via a refresh script (PLAN-001 pattern) — these change rarely.
   - `ref_ssb_family_type`, `ref_ssb_household_type`, `ref_ssb_nivaa` (existing — Owner = SSB)
   - `ref_fhi_utdann`, `ref_fhi_innvkat` (existing — Owner = FHI)
   - `ref_brreg_icnpo`, `ref_brreg_organisasjonsform` (new — Owner = Brreg)
   - `ref_un_sdg` (new — Owner = UN)
   - `ref_iso_currency`, `ref_iso_country` (when added — Owner = ISO; though Atlas may prefer `dim_country` joined to ISO)
   - `ref_atlas_service_category` (new — Owner = Atlas)

3. **`crosswalk_<from>_<to>`** — used when explicit many-to-many or alternative-key mapping is needed between two reference systems.
   - `crosswalk_kommune_name` (alternative names → kommune_nr; `from = kommune_name`, `to = kommune_nr` — read as "crosswalk of kommune names to canonical numbers")
   - `crosswalk_activity_to_category` (NGO local activity name → Atlas service category)
   - `crosswalk_kommune_to_postnummer` (if needed alongside `dim_postnummer`)

   The naming pattern is "crosswalk_X" where X reads as the relationship; consistency over rigidity.

### What goes in v1 (the immediate need)

For [INVESTIGATE-ngo-supply-data-model.md](INVESTIGATE-ngo-supply-data-model.md)'s PLAN-A:

| Table | Convention | Refresh | Owner | Source |
|---|---|---|---|---|
| `dim_ngo` | dim_ | manual seed v1 → Brreg pull v1.5 | Brreg | Frivillighetsregister API |
| `dim_postnummer` | dim_ | quarterly | Posten / SSB Klass 488 | SSB Klass API |
| `ref_brreg_icnpo` | ref_ | rare (last revised 2009) | Brreg | `/frivillighetsregisteret/api/icnpo-kategorier` |
| `ref_un_sdg` | ref_ | never (17 goals fixed since 2015) | UN | One-off CSV pin |
| `ref_atlas_service_category` | ref_ | curated (manual edits) | Atlas | Hand-written CSV |
| `crosswalk_kommune_name` | crosswalk_ | annual + at reforms | derived | SSB Klass historical names |
| `crosswalk_activity_to_category` | crosswalk_ | curated (each new NGO ingest) | Atlas | Hand-written CSV |

### What goes later (just naming, no immediate action)

- `dim_country` (when first Tier C donor-org ingest lands)
- `ref_brreg_organisasjonsform` (when filtering NGO type becomes a UI need)
- `ref_brreg_naeringskode` (when comparing NGOs to non-NGO orgs)
- `ref_helseregion`, `ref_politidistrikt` (when health/justice indicators need rolling up by their official region)
- `dim_sentralitet` OR `dim_kommune.sentralitet_class` attribute (Sentralitet is a kommune attribute, so attribute on dim_kommune is cleaner than a new dim — TBD when we actually ingest Klass 128)
- `dim_bydel` (when first bydel-granularity indicator ingests)

### Refresh-cadence categories

| Cadence | Examples | Mechanism |
|---|---|---|
| **Never** (truly fixed) | `ref_un_sdg`, ISO standards | Pin once, comment "do not refresh" |
| **Rare** (years between revisions) | `ref_brreg_icnpo` (2009), `ref_ssb_*` decoders | Manual via refresh script; review once per year |
| **Periodic** (annual / quarterly) | `dim_kommune`, `dim_fylke`, `dim_postnummer`, `crosswalk_kommune_name` | Scheduled (initially manual, automatable later) |
| **Curated** (Atlas owns; changes when team decides) | `ref_atlas_service_category`, `crosswalk_activity_to_category` | Edit CSV in PR, no refresh script |

These are the four buckets. Each new table fits into one — choose at creation time and document in the seeds README.

---

## Open Questions

1. **Should `ref_atlas_*` use `atlas` as the owner token, or just drop the owner?** Atlas-owned vocabularies are a special case — there's no upstream to refresh from. Two reasonable answers: `ref_atlas_service_category` (consistent with the owner-token pattern) or `ref_service_category` (simpler when there's no namespace ambiguity). Recommendation: keep `atlas` for symmetry — it's only one token longer.

2. **Where does `dim_postnummer` actually fit?** It's a dimension by the join-target rule, but it carries no facts itself — it's pure routing data (postnummer → kommune_nr). Alternative: model it as `crosswalk_postnummer_to_kommune` because that's all it does. Recommendation: `dim_postnummer` because it carries other useful columns (post office name, bydel link if Oslo) beyond just the kommune link, and might gain more attributes over time. It's a real entity, not just a routing table.

3. **ICNPO codes inside `dim_ngo`** — the convention says external taxonomies live in their own `ref_*` table. But each NGO carries up to 3 ICNPO codes natively in Brreg. Should `dim_ngo` carry them as denormalised columns (`icnpo_code_1`, `icnpo_code_2`, `icnpo_code_3`) with a relationships test to `ref_brreg_icnpo`, or as a separate junction `crosswalk_ngo_to_icnpo` with one row per (ngo, icnpo) pair? Recommendation: denormalised columns because the cardinality is hard-capped at 3 and the ranking matters; junction table would lose the ordering without an extra column anyway.

4. **Naming-conventions.md update** — this convention belongs in [`docs/stack/naming-conventions.md`](https://github.com/terchris/atlas/tree/main/docs/stack/naming-conventions.md), which already has model-naming guidance (`dim_*`, `indicators__*`, `fact_*`, `mart_*`). Adding `ref_<owner>_<concept>` and `crosswalk_<from>_<to>` extends that section. Should be part of the implementing PLAN.

5. **Should `ssb-klass-kommuner` ingest pattern be reused for all SSB Klass-sourced reference tables?** The existing `ssb-klass-kommuner` and `ssb-klass-fylker` ingests both fetch from SSB Klass. New tables (`dim_postnummer` from Klass 488, `ref_helseregion` from Klass 100, etc.) could follow the same pattern: one ingest folder per Klass table. **Recommendation: yes, for consistency.** But that's an implementation detail for the implementing PLAN, not a convention question.

---

## Recommendation summary

Adopt **Option A + D**: keep `dim_*`, refine `ref_*` to mandate `ref_<owner>_<concept>`, and add `crosswalk_<from>_<to>` as a third pattern. Refresh cadence is one of four buckets (never / rare / periodic / curated), chosen at table creation and documented in the seeds README.

This convention covers every reference/dimension table currently planned through v1.5 without inventing new prefixes. It honours existing tables (no renames needed). It encodes ownership at the table-name level, making it grep-friendly and audit-friendly.

**Concrete first delivery:** a small implementation PLAN that:
1. Updates `docs/stack/naming-conventions.md` with the rule + the four refresh buckets.
2. Adds the `crosswalk_<from>_<to>` example to the canonical vocabulary table.
3. Doesn't touch any actual data — the convention applies prospectively to PLAN-A of `INVESTIGATE-ngo-supply-data-model.md` and every subsequent reference-table addition.

---

## Next Steps

- [ ] **PLAN-reference-tables-convention.md** — update [`docs/stack/naming-conventions.md`](https://github.com/terchris/atlas/tree/main/docs/stack/naming-conventions.md) with the prefix rule, the owner-token pattern for `ref_*`, the crosswalk pattern, and the four refresh buckets. Cross-link from `INVESTIGATE-ngo-supply-data-model.md` so its PLAN-A picks up the convention. Estimated effort: ~1 hour, mostly doc work.

### Not in scope for this investigation

- Actually building any of the proposed tables — that's PLAN-A through PLAN-D of [INVESTIGATE-ngo-supply-data-model.md](INVESTIGATE-ngo-supply-data-model.md).
- Building the Brreg ingest infrastructure — separate work; mentioned here only to ground the recommendation.
- Decisions about *which* SSB Klass classifications Atlas will ever need beyond the current near-term list.

---

## Cross-references

- **Authoritative sources reviewed:**
  - [Brreg Enhetsregisteret API documentation](https://data.brreg.no/enhetsregisteret/api/dokumentasjon/no/index.html) — open data, no auth, includes Frivillighetsregister + ICNPO endpoints.
  - [SSB Klass](https://www.ssb.no/klass/) — Norwegian classification registry; 80+ classifications via unified API with correspondence tables.
  - [Brreg available NGO categories (ICNPO)](https://www.brreg.no/en/associations-2/register-a-club-or-an-association/registration-in-the-register-of-non-profit-organisations/available-categories-of-the-activity/) — the canonical 12+30 list.
  - [UN SDGs](https://sdgs.un.org/goals) — 17 goals.
- **Atlas-internal:**
  - [`docs/stack/naming-conventions.md`](https://github.com/terchris/atlas/tree/main/docs/stack/naming-conventions.md) — current vocabulary, will be extended.
  - [`docs/ai-developer/plans/backlog/INVESTIGATE-ngo-supply-data-model.md`](INVESTIGATE-ngo-supply-data-model.md) — the consumer of this convention.
  - [`docs/ai-developer/plans/completed/INVESTIGATE-code-label-mapping.md`](../completed/INVESTIGATE-code-label-mapping.md) — the prior art that established `ref_<owner>_<concept>`.
  - [`docs/stack/erd.md`](https://github.com/terchris/atlas/tree/main/docs/stack/erd.md) — auto-generated ERD; will pick up new tables as they land.
