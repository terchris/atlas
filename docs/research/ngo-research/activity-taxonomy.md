# Common activity categories across NGOs

How to get from *"Kløvertur"* and *"Besøkstjeneste"* — two organisations' private names for
their own programmes — to categories that compare across all of them.

Written 21 September 2026; chapter and catalogue counts refreshed 2 October 2026 against
`data/`. Everything measured is marked as such; the method in §5 is a proposal.

---

## 1. The gap in the NRX contract

`BranchActivity` carries two fields:

```
globalActivityName   "Besøkstjeneste"
localActivityName    "Kolvereid Røde Kors Besøkstjeneste"
```

Both are **names**. There is no text, so there is nothing to analyse. Two organisations
running the same thing under different names are unmatchable, and one organisation running
two different things under similar names is indistinguishable.

**The extension adds an activity catalogue** (`ActivityDefinition`, one `data/<org>/activities.json`
per NGO) — one record per canonical activity per NGO, carrying the NGO's own description
text. Chapters reference it from `activities[].definition`. See
`dist/schema/ActivityDefinition.schema.json`, generated from `api/volunteering/v1/`.

### Why the catalogue, and not a field on the branch

N.K.S. has **14 catalogue activities across 575 chapters** (11 at the first harvest).
Kløvertur's 91-word description is the same 91 words on every chapter that runs it — 198 of
them. Putting it on the branch would store it 198 times and
produce a corpus nobody can read.

At catalogue level the numbers are different in kind:

| | Branch-activity rows | Catalogue records |
|---|---|---|
| Sanitetskvinnene | 649 (361 chapters with activities) | **14** |
| All 11 Tier A NGOs | thousands | **200 measured** (4 NGOs: 14 + 6 + 36 + 144) |

**~200 records is the whole point.** That is small enough that *every* derived category
can be read and confirmed by a person, rather than sampled. It turns AI-assisted
classification from something requiring a sampling protocol into something requiring an
afternoon — and that difference is what makes bestemmelse 6 satisfiable rather than
aspirational.

---

## 2. The corpus that exists today

Harvested 21 Sep 2026 by `ingest/src/sources/nks-activities.ts` (`npm run nks:activities`) —
**11/11 activities, median 98 words, 1 093 words total**. The current
`data/sanitetskvinnene/activities.json` holds 14: these 11, *Sisterhood* (66 words, found
later — see §4b) and the local-only stubs *Lesevenn* and *Dig In* (no text):

| Activity | Words | Target groups found | Delivery mode |
|---|---|---|---|
| Næringsliv | 152 | — | — |
| Eldre | 123 | eldre | møteplass |
| Kvinnehelse lokalt | 115 | kvinner | møteplass |
| Kanskje kommer kongen | 107 | eldre, kvinner | møteplass |
| Ressursvenn | 106 | kvinner | gruppe, nettverk |
| Omsorgsberedskap | 98 | — | gruppe |
| Kløvertur | 91 | — | lavterskel, utendørs |
| Aktiviteter på asylmottak | 83 | kvinner | kurs |
| Motherhood | 78 | barn, innvandrerkvinner, kvinner | lavterskel, veiledning |
| Språkvenn | 68 | flyktninger, innvandrede kvinner, innvandrere | gruppe |
| Integrering | 72 | innvandrere | gruppe |

The text is substantive enough to categorise on. Ressursvenn's description alone gives the
beneficiary (*voldsutsatte kvinner*), the mechanism (*en frivillig kvinne kobles sammen med*),
and the purpose (*støtte og venn i en periode*) — three independent signals.

---

## 3. Three text sources, with measured coverage

| Source | Unit | Coverage | Quality |
|---|---|---|---|
| **NGO activity catalogue** | canonical activity | 12/12 national for N.K.S.; 36 Frelsesarmeen, 144 Kirkens Bymisjon, 6 Nasjonalforeningen | Best for N.K.S. (median ~98 words). ⚠️ Thin elsewhere: median ~10 words (Frelsesarmeen), 17 (Kirkens Bymisjon), none for Nasjonalforeningen — all below the 25-word "thin" threshold |
| **`brreg_enhet.doc.aktivitet`** | organisation | **72 813 / 72 815** (two hold the literal string `[]`) | Short, self-written, uneven — *"lokalforening med dertilhørende spesialforeninger som besøkstjeneste, hjelpekorps og barne/ungdomsarbeid"* |
| **frivillig.no missions** | activity × place | 2 477 harvested of 3 063 declared missions / 1 356 orgs (21 Sep harvest) | Recruitment copy, geocoded, carries orgnr |

They are complementary, not alternatives. The catalogue defines *what the activity is*; Brreg
says *what this particular chapter says it does*; frivillig.no says *what is running now and
where*. Categorise on the first, and use the other two as corroboration — the same two-source
rule this folder applies everywhere else.

---

## 4. The target taxonomy — do not invent one

Three candidates already exist. Building a fourth from scratch would be the wrong instinct.

### a. ICNPO — already on every organisation

In Atlas as `icnpo_nummer` / `icnpo_kategori`, 100% coverage, international standard,
already seeded in the repo as `ref_brreg_icnpo.csv`.

**But it classifies organisations by field, not activities by what they do.** Kløvertur (a
walking group) and Omsorgsberedskap (municipal emergency support) both sit under health/social
for the same organisation. Too coarse for this axis — and it is a *different axis*: ICNPO
answers "what kind of organisation", the service taxonomy answers "what does this activity do".
Keep both; do not collapse them.

### b. frivillig.no `purposes` — a real cross-NGO vocabulary, already applied

Measured 21 Sep 2026: applied to **1 337 organisations and all 2 477 harvested missions**
(of 3 063 declared — see `source-frivillig-no.md`). Not re-verifiable here: the harvest is not
on disk.

```
Lokalmiljø · Barn og unge · Helse og sosial · Eldre · Friluft og fritid · Flyktninger
Kultur og festival · Fattigdom og rusmisbruk · Samfunn · Idrett · Tro og livssyn
Beredskap · Utdanning · Miljø og dyr · Politikk og internasjonalt
```

Strong candidate: Norwegian, activity-level, externally defined, and already in use across
organisations — so it is not Røde Kors imposing a scheme on peers.

⚠️ **It has visible drift.** `Fattigdom og rusmisbruk` and `Fattigdom og rus` both occur; so
do `Friluft og fritid`, `Friluftsliv` and `Fritid`. The payload has an `oldPurposes` field, so
this is legacy migration. Any adoption must normalise these and record the mapping.

### c. `ref_atlas_service_category` — Atlas's own

Referenced throughout the Atlas API column documentation as the FK target for
`service_category_code`, but **not exposed through `api_v1`**, so its contents are unknown to
me. This is the first thing to check — if it already exists and is populated, it is the answer
and §5 becomes a mapping exercise rather than a design one.

**Recommendation:** anchor to `ref_atlas_service_category` if it exists; otherwise adopt
frivillig.no's vocabulary, normalised, and record ICNPO alongside on the organisation axis.

---

## 4b. Local-only activities — measured, and more common than expected

**A chapter can run an activity its national office has never defined.** Not an edge case:
on a 90-chapter N.K.S. sample,

| Activity | Chapters | Share | Origin |
|---|---|---|---|
| Omsorgsber. | 50 | 55.6% | national |
| Kløvertur | 35 | 38.9% | national |
| **Lesevenn** | **11** | **12.2%** | 🔴 **local-only** — `/lesevenn` 404 |
| Språkvenn | 10 | 11.1% | national |
| **Dig In** | 4 | 4.4% | 🔴 **local-only** — `/dig-in` 404 |
| Ressursvenn | 1 | 1.1% | national |

On the sample, **Lesevenn looked more widespread than Språkvenn, which *is* in the national
catalogue.** The full crawl (575 chapters, current `chapters.json`) does not confirm the
ordering: **Lesevenn on 48 chapters (8.3%), Språkvenn on 64**, Dig In on 17. Still a
local-only activity on ~1 in 12 chapters — the finding stands, the ranking does not. On the
sample table above, 2 of 6 distinct activities were local-only; across the full crawl it is 2
of 7 (Sisterhood is the seventh, national).

The Lesevenn catalogue entry's `chapterCount` (48) and the description in
`schemas/fields/v1/activity-origin.yaml` agree with the chapter rows as of 3 Oct 2026.

### How it is handled

`origin` on the catalogue entry: `NATIONAL` | `LOCAL` | `UNKNOWN`. Local-only activities
become **first-class catalogue stubs** — real `id`, referenced normally by chapters,
categorisable — with `description: null`, because there is no national page to harvest text
from. `nks-chapters.ts` mints them automatically, so **no `activities[].definition.id` ever
dangles** (`npm run check:integrity` in `schemas/build/` enforces it) and
the gap is visible in the catalogue where someone can act on it rather than buried in
chapter rows.

`isPromotionCandidate` marks a local activity widespread enough that the national office
would probably want to know. **A programme running across dozens of chapters below the
national radar is arguably the most useful thing this dataset can tell an NGO about
itself** — Lesevenn on 48 measured chapters clearly qualifies.

### Two cautions

⚠️ **Distinguish a genuinely local activity from a harvester gap.** *Sisterhood* looked
local-only until `/sisterhood` returned 200 — the harvester only reads
`/foreningsnett/aktiviteter*`, so it missed a national page outside that path.
`originEvidence` records what was actually checked. **The harvester should discover activity
pages from the sitemap rather than a hardcoded path list.**

⚠️ **Local-only activities cannot be categorised from description text**, because there is
none. They need either a chapter-page description or a human. That is a real limit on §5's
method for exactly the activities the national taxonomy does not cover.

### An unresolved discrepancy

Omsorgsberedskap's own national page states *"170 omsorgsberedskapsgrupper over hele
landet"*. The 90-chapter sample (50 of 90, 55.6%) extrapolated to **~258 chapters** over the
464 chapters known at the time; the same rate over today's 575 gives ~319, and the full crawl
measures **300** offering it — so sample and crawl agree. The gap that remains is against the
organisation's own 170: either "grupper" and "chapters offering it" are not the same unit, or
the national figure is out of date.
This is the reach sanity check proposed in §6 firing on its first use — worth resolving
before any figure is published.

---

## 5. Method

Per NGO, then across:

1. **Harvest the catalogue** with descriptions — `ingest/src/sources/nks-activities.ts` is the template.
2. **Resolve aliases.** Chapter pages abbreviate (`Omsorgsber.` → *Omsorgsberedskap*). Aliases
   accumulate on the catalogue entry, so the mapping table lives with the thing it maps.
   Done for N.K.S. (`npm run derive`, 3 Oct 2026): `Omsorgsber.` and `Språkvenn` — the
   latter against the catalogue's own misspelling `Språkvennn` — are the only provision
   names that differ from a definition's name. The other three catalogues' chapters use the
   catalogue names verbatim.
3. **Extract target group and delivery mode** by keyword against the NGO's own words. This is
   deliberately a transparent keyword list, not a model — it is reproducible and reviewable,
   and it preserves the NGO's vocabulary instead of imposing ours.
4. **Assign the common category** from the full description text. Record
   `serviceCategory.assignmentMethod`, `serviceCategory.confidence`, and — the field that
   matters — who reviewed it. (`reviewedBy`/`reviewedAt` were taken out of the public
   contract on 3 Oct 2026 because no review has happened yet; re-add them to
   `service-category.yaml` with the first reviewed batch.)
5. **Review all of them.** Not a sample. ~200 records makes this tractable, and
   `AI_ASSISTED` should be a transient state on the way to `MANUAL`, never a final one.
6. **Weight by reach.** `chapterCount` distinguishes a 3-chapter pilot from Omsorgsberedskap's
   170 groups. An unweighted category count would treat them as equals. ⚠️ Not yet
   implemented for N.K.S.: `chapterCount` is unset on all 12 national catalogue entries
   (only the two local stubs carry it), so reach currently has to be counted from chapter rows.

### The non-service problem, found in the first pass

**Næringsliv** has 152 words and produced *no* target group and *no* delivery mode. Reading it,
that is correct: it is internal guidance on partnering with local businesses — fundraising
support, not a service to anyone.

So an NGO's own activity catalogue mixes **services to beneficiaries** with **internal
organisational activity**. Any cross-NGO comparison that counts them together will overstate
service provision, and each NGO will overstate differently.

**Make the `isService` decision in step 4** (the field exists on `ActivityDefinition`; it
is not yet populated systematically), before the category is assigned. The absence of
both a target group and a delivery mode turns out to be a usable first signal for it — found
by accident here, worth testing deliberately on the next NGO.

---

## 6. Validation

- **Cross-source agreement.** Where an NGO appears in both its own catalogue and frivillig.no,
  compare the derived category against frivillig.no's `purposes`. Disagreement is a review
  queue, not an error.
- **Reach sanity.** Omsorgsberedskap claims *"170 omsorgsberedskapsgrupper over hele landet"*
  in its own text. The chapter data should corroborate that order of magnitude; if it says 12,
  the alias resolution is broken.
- **Thin descriptions.** Under ~25 words there is too little signal — the harvester flags
  these rather than letting them yield a confident-looking category. None of N.K.S.'s 12
  national descriptions falls below the threshold (minimum 66 words).
- **Nynorsk.** `descriptionLanguage` is recorded because a categoriser tuned to bokmål will
  mishandle nynorsk. Five of the 12 national descriptions come back `UNKNOWN` (Eldre, Kanskje
  kommer kongen, Kløvertur, Kvinnehelse lokalt, Motherhood) — all bokmål to a reader, so this
  is a detector limitation, not a text problem. The two local stubs are `UNKNOWN` because they
  have no text.

---

## 7. Compliance

⚠️ Step 4 is **AI-assisted classification of text into a taxonomy**, and the output is Røde
Kors' responsibility however it was produced (bestemmelse 6).

Three things make that manageable here, and they are design choices rather than
after-the-fact mitigations:

- The corpus is **150–250 records**, so review is complete rather than sampled.
- Every record keeps its `description` **verbatim** and its `descriptionSourceUrl`, so a
  reviewer checks against the source without re-crawling.
- `serviceCategory.assignmentMethod` is stored per row, so AI-assigned categories are visible as such to
  anyone downstream — which is what bestemmelse 8 (åpenhet) requires.

**One judgement to make explicitly:** these are categories Røde Kors assigns to *other
organisations'* work, published under a Røde Kors name. Mis-categorising a peer's activity is
a different kind of error from mis-categorising your own. Recommendation: before anything is
published, show each NGO its own rows. That is also simply good manners, and it is the same
step recommended before crawling their sites at all.

---

## 8. Open

- **What is in `ref_atlas_service_category`?** Blocks the choice in §4. Not exposed via the
  API — needs a look at the repo or the database.
- Do the other NGOs publish activity catalogues with text? Four are harvested (N.K.S.,
  Frelsesarmeen, Kirkens Bymisjon, Nasjonalforeningen), but only N.K.S.'s carry enough text to
  categorise (§3); the other seven are not surveyed.
- Røde Kors's own `globalActivityName` values come from the NRX API, which is down — so the
  organisation best placed to anchor the taxonomy is currently the one with no data.
- Should `targetGroups` become a controlled vocabulary, or stay in each NGO's words? Currently
  the latter, deliberately — normalising it is a separate reviewable step, not a parser change.
