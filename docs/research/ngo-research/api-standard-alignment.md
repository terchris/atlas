# Alignment with the Red Cross API Standard

Read `rules/design/` on 22 September 2026. **We inherit the *how*, not the *what*.**

The standard's conventions — casing, nullability, errors, paging, "no internal names" — are
general API craft and we adopt them wholesale. Red Cross's **domain vocabulary**
(`OrganizationUnit`, `Activity.nationalActivity`, `Shift`, `branchNumber`) is one
organisation's model of itself, and this is a system for **all** Norwegian NGOs. We do not
inherit that.

That distinction fixes a design error that ran through the old `schema/` folder.

> **Status, re-checked 2 October 2026.** Most of what follows is now **history**: the
> hand-written `schema/` folder and `validate_schema.py` are gone, the contract is authored
> as YAML under `api/` and `schemas/` and generated into `dist/` (see `api/README.md`), and
> the `x_` prefixes and `data`/`metadata` envelope no longer appear anywhere. Each section
> carries a status line. What is still open is collected in §5, §7 and §8 (the 3 October audit,
> most of which was fixed the same day).

---

## 1. The error: I made one NGO's API shape our contract

> **Resolved.** The contract is our own `Chapter` shape; NRX is treated as a source.

`schema/` adopts the current `nrx/v1/organizations` response *verbatim*, and
`validate_schema.py` asserts on every run that **an unmodified NRX payload validates**.
I treated that property as a feature. With the framing corrected it is a **defect**:

- Sanitetskvinnene records call themselves `branch`, carry an empty `branchNumber`
  ("organization number used in **Red Cross systems**"), and a `branchType` whose enum is
  `Lokalforening | Distrikt | Nasjonalkontor`.
- Every field I added is prefixed `x_` — because I was extending someone else's contract.
  **In a general system there is nothing to extend.** Those are first-class fields wearing
  an apology.
- The envelope is `{data: {branches, metadata}}`, which the standard explicitly forbids
  (*"never a custom `data`/`metadata` wrapper"*). I had logged this as unfixable because it
  *is* the NRX response. It is only unfixable if NRX's shape is our contract. It is not.

**The correct relationship: NRX is a source we map *from*, exactly like Brreg,
frivillig.no and sanitetskvinnene.no.** The standard says this itself — the internal↔external
mapping *"lives only in the gateway policy … and the per-resource mapping document, never in
the published API."*

---

## 2. What we inherit — the conventions

> **Adopted.** Casing, enum style, omit-don't-null, no nullable types and the `items`
> envelope are enforced on every build by `.spectral.yaml` and `build-openapi.ts`.

Adopted as-is, no deviation:

| Rule | Detail |
|---|---|
| **Property casing** | `camelCase`. Path segments `kebab-case`. |
| **Enum values** | `UPPER_SNAKE_CASE`, each documented. Closed in requests (`422` on unknown), open in responses — consumers are tolerant readers. |
| **Atomic types** | Reusable field types define **format only** and are **non-nullable**. Optionality is the consumer's concern — leave it out of `required`. |
| **Empty values** | **Omitted**, never `null`. |
| **No internal names** | Never in property names, descriptions, titles or examples. The mapping document is the only place they appear. |
| **Dates** | RFC 3339. Date = `2026-06-29`; timestamp = `2026-06-29T14:00:00Z`, always UTC `Z`. |
| **Identifiers** | Opaque strings; never a guessable sequential key. |
| **Booleans** | Positive assertions — `isActive`, `hasConsented`; never a negative. |
| **Collections** | `{ items: [...], next: "…cursor…" }`. Cursor paging, bounded page size. |
| **Filtering / sorting** | `?status=ACTIVE`, ranges as `…From`/`…To`, `?sort=-createdAt,name`. |
| **Free-text search** | the single reserved `q` parameter. |
| **Errors** | RFC 9457 `application/problem+json`. |
| **Spec** | OpenAPI 3.1. |
| **Money** | `{ currency, value }` — same key set everywhere. |
| **Resource modelling** | Name the business concept, not the table. Expose only fields observed populated. Borrow a schema.org name where it genuinely fits. |

The three rules that matter most for *this* dataset, because they cut against choices I made:

- **Non-nullable atomics + omit-don't-null.** I used `null` to mean *"the source is
  silent"* — argued at length in `data-freshness.md`. Omission says the same thing and is
  the house rule. One caveat to carry: `assertedAt` absent must read as **unknown**, never
  as *false* or *never confirmed by us*. The tolerant-reader rule already requires that.
- **No internal names.** `branchNumber`, and every `nrx_*` in my descriptions, must go.
- **`items` + cursor.** Replaces the `data`/`metadata` wrapper.

---

## 3. What we do *not* inherit — and what we learn from anyway

Red Cross's domain model is not our vocabulary. But it is **strong evidence**, because it is
a mature model of the same problem, and twice it confirms a structure derived here
independently.

### Their activity model validates ours

```
nrx_nationalactivity  →  nrx_humanitarianactivity  →  nrx_shift  →  nrx_position
   (global definition)      (local, at a branch)        (occasion)    (a slot)
```

Exposed as `Activity.nationalActivity.{id,name}` + `Activity.branch` + `Activity.group`.

**That is exactly the global→local split in `activity-taxonomy.md`, arrived at separately.**
Independent convergence on the same structure is the best evidence available that it is
right. Two things worth *borrowing as ideas*, not names:

- **An activity *group* as a real entity** (`nrx_humanitarianactivitygroup`), where my
  `parentActivityId` is a self-reference. Theirs is better.
- `nationalActivity` is **not required** — so a local activity with no global definition is
  already legal in their model too. That independently vindicates the `origin: local` case
  measured in §4b (Lesevenn: 22 of 200 N.K.S. chapters, no national page).

### Their demand model is better than mine — for them

A **position** is a slot on a shift that may or may not have a volunteer attached, and the
CRM runs a live view called **"Ubesatte stillinger"** — unfilled positions.

| My `volunteerNeed` | Their model |
|---|---|
| `status: NEEDED / FILLED / UNKNOWN` | derived: a position with no volunteer |
| `positionsOpen` — always null, no source | **countable** |
| `asOf` / `expiresAt` / 90-day TTL | a shift has `start`/`end` — **expires by nature** |

A shift-based model needs no staleness heuristic: a shift in the past is not demand.

⚠️ **But it does not generalise.** N.K.S. publishes no shifts; nor does any other NGO
surveyed. A general contract cannot require a shift model that one of eleven organisations
has. So: **`volunteerNeed` stays the general representation**, and a shift-bearing source
populates it precisely (`positionsOpen` = unfilled count, `expiresAt` = shift end) instead
of vaguely. Red Cross becomes the source with the best data, not the shape everyone must adopt.

> **Status 3 Oct 2026:** the design stands, but `volunteerNeed` is not in the public contract
> yet — no producer fills it, so `VolunteerNeed` is parked in `api/_internal` until one does (§8).

### Also not inherited

`branchNumber` (an internal RK key), `branchType`'s three-value enum, `level`,
`organizationLevel`, the `businessunit` framing, and `OrganizationUnit` as a resource name —
which is *Dataverse's* word for a branch, not the general concept.

---

## 4. Proposed general vocabulary

Named for the concept as it exists across all NGOs, following every convention in §2.

> **Adopted**, except `ActivityGroup`, which has no schema yet.

| Entity | Was (NRX-shaped) | Proposed |
|---|---|---|
| The national organisation | *(implicit in `ngo`)* | **`Organization`** — now `api/organization/v1/organization.yaml`. `Chapter.organization` and `ActivityDefinition.organization` reference it by id |
| A local unit | `Branch` | **`Chapter`** |
| A nationally defined activity | `ActivityCatalogEntry` | **`ActivityDefinition`** |
| An activity run by a chapter | `BranchActivity` | **`Activity`** |
| A grouping of definitions | `parentActivityId` | **`ActivityGroup`** |
| A named contact | `BranchContact` | **`Contact`** |
| Volunteer demand | `VolunteerNeed` | **`VolunteerNeed`** *(unchanged)* |

Field renames, with the `x_` prefixes dropped — these are our fields now:

| Was | Becomes |
|---|---|
| `branchId` | `id` |
| `branchName` | `name` |
| `branchType` | `chapterType` *(the NGO's own word — "Sanitetsforening")* |
| `x_source.chapter_level` | `level` — `NATIONAL \| REGIONAL \| LOCAL \| RELATED_ENTITY` |
| `branchParent` | `parent` |
| `organizationNumber` | `organizationNumber` *(a national registry id, not internal — keep)* |
| `branchNumber` | **dropped** — internal RK key |
| `branchLocation.*` | `municipality`, `county`, `postalCode`, `postalPlace`, `coordinates` |
| `geoLocation` | `coordinates` *(also sheds the GeoJSON envelope)* |
| `communicationChannels.web` | `website` |
| `branchActivities` | `activities` |
| `x_volunteer_need` | `volunteerNeed` |
| `x_freshness` | `freshness` |
| `x_source` | `provenance` |
| `as_of`, `content_hash`, `changed_at`, `first_seen_at` | `asOf`, `contentHash`, `changedAt`, `firstSeenAt` |
| `is_primary`, `parse_suspect` | `isPrimary`, `isParseSuspect` |
| `globalActivityName` / `localActivityName` | `definition.name` / `name` |

Enums to `UPPER_SNAKE_CASE`: `NEEDED`, `FILLED`, `UNKNOWN`; `NATIONAL`, `LOCAL`;
`STRUCTURAL`, `SLOW`, `ANNUAL`, `VOLATILE`; `HIGH`, `MEDIUM`, `LOW`; `BOTH`, `SOURCE_ONLY`,
`REGISTRY_ONLY`, `UNRECONCILED`.

Collections become `{ items: [...], next }`. `activityCatalog` becomes its own collection
rather than a sibling array in one envelope.

### What survives untouched

- **The global→local activity split** — confirmed by their model.
- **`description` on the definition** — still ours; their `Activity` has no description
  field, and cross-NGO categorisation needs one.
- **`origin: LOCAL`** for chapter-invented activities.
- **Per-block `freshness` and change detection.** Nothing in the standard covers
  multi-source provenance — it assumes one authoritative backend. This dataset spans Brreg,
  eleven NGO websites and frivillig.no, so three clocks and per-block hashes stay necessary.
  They are *our* addition, made to the standard's conventions.

---

## 5. Consequences

1. **`validate_schema.py`'s NRX assertion is deleted.** Conforming to one NGO's payload was
   the wrong target. It is replaced by an **NRX→`Chapter` mapping test**: given the NRX
   sample, the mapper must produce a valid `Chapter`. That tests what actually matters.
   *Status: the assertion is gone; the mapping test is **still open** — no NRX sample is on
   disk (`contracts/` holds only its README) and `api.redcross.no` returns 500.*
2. **A mapping document per source** — NRX, Brreg, frivillig.no, N.K.S. — per the standard's
   rule that internal names live only in the mapping. `ngo/contracts/` is the natural home.
   *Status: **still open**.*
3. **The `x_` prefix disappears entirely.** *Status: done — no `x_` field remains in the YAML.*
4. **`schema/` gets renamed throughout**, and the extractors with it. Mechanical but wide.
   *Status: done — `api/` + `schemas/` YAML, extractors ported to TypeScript in `ingest/`.*

## 6. Open

- The `Chapter` vs `LocalChapter` naming call — `Chapter` reads better and `level`
  distinguishes national/regional/local anyway.
- Is `organizationNumber` the right general name, or should it be `registryId` with a
  `registry` qualifier, given non-Norwegian NGOs would carry a different national id?
- Whether `rules/design/standard/vocabulary.md`'s schema.org guidance pulls any of these
  names — `name`, `description`, `email`, `postalCode`, `coordinates` are all schema.org
  terms already, which is a good sign.

## 7. New deviations found 2 October 2026

The build is green, but three things in the current YAML still fall short of the standard:

- **Registry field names in published descriptions.** The no-internal-names rule covers
  descriptions, and the bundles quote Brreg's own field names — `erIKonsern`,
  `stiftelsesdato`, `aktivitet`, `organisasjonsform` (2 each in the organisation bundle;
  `overordnetEnhet` appears in the YAML comments and docs but not in the bundles) — and
  `chapter-base.yaml` names NRX's `branchParent` / `BranchBase`. The build's check only
  greps for `nrx_|msdyn_|businessunit|statecode|dataverse`, so none of these trip it. They
  belong in a per-source mapping document (§5.2); left in place until that exists, so the
  provenance explanation is not lost.
- **`sort` named a field that does not exist.** The `listChapters` example was
  `-chapterCount,name`; `chapterCount` is an `Organization` field, not a `Chapter` one.
  Fixed: the example is now `-memberCount,name` and the sortable fields are listed, as the
  standard requires.
- **`q` does not say which fields it searches.** The shared parameter in
  `schemas/build/constants/openapi-defaults/parameters.yaml` is undocumented as to scope.
  Paging also offers `next` but no `prev`. Both still open.

## 8. Open items found 3 October 2026

All of these passed `npm run all`; schema validation could not see them. Counted against
`data/` on 3 Oct 2026. Four of the six were fixed the same day; each carries its status.

- **Self links were declared but never populated.** *Status: **resolved**.* `href` is now
  derived from the id and the route by `npm run derive` (`ingest/`) on every chapter row,
  organisation and activity definition, and on organisation and definition references -
  `https://atlas.helpers.no/<area>/v1/<collection>/<id>`, the first server in
  `servers.yaml`. `check:integrity` #9 fails if a chapter's `href` does not end in its own
  id. A group reference carries no `href`: `ActivityGroup` has no route yet (§4).
- **Pipeline bookkeeping still reaches the public Chapter.** *Status: **still open**.*
  `api/_internal/v1/openapi.yaml` argues that `contentHash` and similar bookkeeping must not
  reach consumers, yet `BlockFreshness.contentHash` (2 755 blocks), `Provenance.matchMethod`
  (every row, e.g. `nameStrong+activity+crawlName`) and block `source: "registry"` are part
  of the published Chapter. Either move them to the internal envelope or state why they are
  consumer-facing.
- **`Coordinates` bounds exclude units the contract supports.** *Status: **still open**
  (latent).* Latitude 57–82 / longitude 4–32 would reject the 7 Icelandic and Faroese units
  that `country-code.yaml` deliberately allows, once any of them gets coordinates.
- **Fields declared but never populated.** *Status: **resolved**, one decision per field,
  against `vocabulary.md` ("expose only fields that carry data"):*

  | Field | Decision | Why |
  |---|---|---|
  | `href` (Chapter, Organization, ActivityDefinition) | **filled** | derived - see above |
  | ActivityDefinition `aliases` | **filled** | the names chapters actually use: 'Omsorgsber.' (300), 'Språkvenn' (64) |
  | Chapter `region`, `instagramUrl` | **removed** | no producer; `region` had no definition at all |
  | ServiceCategory `reviewedBy`, `reviewedAt` | **removed** | no review has happened; re-add when the first manual review is recorded |
  | Activity `volunteerNeed`, Freshness `blocks.demand` | **removed from the public contract** | no producer. `VolunteerNeed` is parked in `api/_internal` so the design stays built and validated - move the `$ref` back when an extractor fills it |
  | Chapter `terminatedDate` | **kept** | `brreg-subunits.ts` writes it from `nedleggelsesdato`; no sub-unit in the pulls has been closed yet |
  | BlockFreshness `changedAt` | **kept** | `nks-chapters.ts` writes it on the first run that sees a block's hash move; only one run has happened |
  | Address `line2` | **kept** | `brreg-subunits.ts` / `build-organizations.ts` write it for multi-line registry addresses; none occurred in the pulls |

  The three kept fields have a producer and a defined condition; they are absent because the
  condition has not occurred, not because nothing would ever write them.
- **`assertedAt` was backfilled from the fetch date.** *Status: **resolved**.* The six
  extractors that stamped the crawl or fetch date now omit it unless the source states a
  date. The 6 936 backfilled values were removed from `data/` (2 755 N.K.S. blocks that
  claimed FRESH on the strength of the crawl date are now UNKNOWN). The 1 610 that remain are
  source-stated: Kirkens Bymisjon's page modified dates and 4H's `og:article:modified_time`.
  `check:integrity` #8 fails if one ever equals the fetch date without a matching
  `sourceUpdatedAt`.
- **The regional tier is modelled but mostly unlinked.** *Status: **partly resolved** - 7
  of 11.* 1 729 chapters now point at a REGIONAL parent, and the new
  `provenance.parentMethod` records how each edge was established:

  | Method | Chapters | Organisations | `parentOrigin` |
  |---|---:|---|---|
  | `URL_PATH` - the site's own URL hierarchy | 1 246 | Diabetesforbundet, 4H, LHL, Nasjonalforeningen | SOURCE |
  | `SITEMAP_PATH` - rodekors.no `/lokalforeninger/<distrikt>/<lag>` | 317 | Røde Kors | SOURCE |
  | `MUNICIPALITY_COUNTY` - inferred from the chapter's municipality | 166 | Mental Helse (133), N.K.S. Rogaland (33) | INFERRED |

  **Still open for three:** Speiderforbundet's kretser ('Vestmarka', 'Ryvarden') and
  Frelsesarmeen's divisjoner do not follow county lines, so geography would invent edges, and
  Folkehjelp's regions are not stated anywhere public. These must come from the
  organisations. Kirkens Bymisjon has no regional tier, which is correct, not a gap.
