# Strategy: NGO chapters and activities

**v2 — rewritten 20 September 2026 against the live Atlas API.** v1 planned a dataset from
scratch. That was wrong: most of it already exists. This version plans only the part that
doesn't, and corrects four things v1 got wrong.

Everything below was measured against `https://api-atlas.urbalurba.com/` and the upstream
APIs on 20 September 2026.

---

## 1. What is already built

The organisation layer is **done**, and further along than the brief assumed.

| View | Rows | What it is |
|---|---|---|
| `brreg_enhet` | **1 174 644** | Every legal entity in Norway, with ICNPO, grasrotandel and the full upstream record in `doc` |
| `kommune_ngo_summary` | **5 435** | Active voluntary orgs per **kommune × ICNPO category** |
| `kommune_ngo_totals` | 357 | One row per kommune |
| `dim_kommune` | 1 158 | Kommune reference incl. historical codes |
| `meta_sources` | 44 | Source registry |

`brreg-frivillige` runs **daily** — last ingest 20 Sep 2026 02:01, 72 815 rows, 7 runs.
`brreg-enheter-alle` holds 1 174 030 rows from the 14 Sep bulk. Both NLOD.

**`kommune_ngo_summary` already answers the brief's headline question** — what voluntary
organisations focus on (ICNPO) and where they are (kommune) — for the whole country. Oslo
alone: 1 241 kunst og kultur, 343 tros- og livssyn, 19 næringsliv. That is the map, at
category resolution, live today.

So the real question is not "how do we get the list". It is **"what does the existing data
still not tell us"** — and the answer is sharp:

| View | Rows | Status |
|---|---|---|
| `ngo_index` / `ngo_overview` | **11** | Tier A seed only |
| `activity_catalog` | **0** | 🔴 empty |
| `kommune_local_chapters` | **0** | 🔴 empty |
| `distrikt_summary` | **0** | 🔴 empty |

**The chapter and activity layers are built and empty.** The schema, the views, the
documentation and 12 downstream models all exist. No rows have ever been written to them.

---

## 2. Four corrections to v1

Recording these because v1 is wrong and someone may read it in git history.

1. **Frivillighetsregisteret has its own API, and I used the wrong one.** The right endpoint is
   `https://data.brreg.no/frivillighetsregisteret/api/frivillige-organisasjoner`. It returns
   `icnpoKategorier[]` (ordered, multiple per org), `grasrotandel`, `innfoertDato`,
   `regnskapsrapportering`, `vedtekter`. v1 concluded ICNPO wasn't available from Brreg and
   proposed sourcing it from tilskudd.no. **Unnecessary** — Atlas already ingests it daily.
2. **The 10 000-row paging cap does not apply.** The frivillige-organisasjoner API uses
   `searchAfter` cursor paging, so the whole register walks cleanly. v1's kommune-partitioning
   workaround and the 210 MB bulk download are both unnecessary for the voluntary population.
3. **Grasrotandelen needs no separate source.** `grasrotandel.deltarI` is on the
   Frivillighetsregisteret record and already surfaces as `brreg_enhet.grasrotandel_deltar_i`.
4. **Røde Kors internal chapter data exists as a registered source.** v1 asked whether it
   existed. It does — see §3.

---

## 3. 🔴 The blocker: the Røde Kors ingest has never run

`meta_sources` registers `redcross-branches`:

```
upstream_url             https://api.redcross.no/nrx/v1/organizations
upstream_title           Norges Røde Kors Organizations API — branches + per-branch activities
description              First NGO-supply ingest. Reads ... and writes it to two raw.* tables
                         — chapters and per-chapter activities.
downstream_model_count   12
total_runs               0          ◄── never executed
last_ingested_at         (null)
```

Twelve downstream models depend on a source that has never produced a row. Probed today:

```
GET https://api.redcross.no/nrx/v1/organizations      → 500 {"error": "Backend request failed"}
GET https://api.redcross.no/nrx/v1/organizations/864139442 → 500 (same)
GET https://api.redcross.no/nrx/v1/activities         → 404 {"statusCode":404,"message":"Resource not found"}
GET https://api.redcross.no/                          → 404 (same gateway shape)
```

Read the two error shapes carefully — they are different, and the difference is the diagnosis.
Unknown paths return the gateway's own `{"statusCode":404,...}`. `/nrx/v1/organizations`
returns `{"error":"Backend request failed"}` instead, which means **the route is registered and
the service behind it is down or failing auth.** This is not a wrong URL. It is a live route
with a dead backend.

**This is the single highest-value thing to fix, and it is internal to Røde Kors — not
something I can resolve from here.** Unblocking it turns 12 already-written models on at once
and populates all three empty views.

A second internal source, `frr` (Frivillig Resource Register), is registered as
`license: internal`, `total_runs: 0`, `downstream_model_count: 0` — declared, never wired up,
and explicitly never to be exposed publicly.

---

## 4. The model Atlas already defines

Read out of the API's own column documentation. This is not my design; it is the existing
contract, and the data must be shaped to fit it.

```
  dim_ngo          orgnr, slug, brand_name, tier (A/B/C), chapter_data_shape,
                   has_chapters, primary_focus, icnpo_code_1..3
       │
       ▼
  dim_chapter      chapter_id (slug), parent_chapter_id, chapter_level
                   ('national' | 'regional' | 'local'), kommune_nr, is_active
       │
       ▼
  dim_activity     activity_id ('redcross-besokstjeneste'), ngo_orgnr,
                   canonical_name, service_category_code → ref_atlas_service_category
```

Three things worth noting, because they show the design already absorbed the hard parts:

- **`chapter_data_shape` assigns an ingest pattern per NGO.** Of the 11 Tier A orgs:
  `api_canonical` (Røde Kors, 1), `cms_bins` (9), `programme_only` (Nasjonalforeningen, 1).
  The "every org is different" problem is already modelled rather than discovered later.
- **`kommune_local_chapters.kommune_nr` carries its own warning in the schema:**
  *"🔴 WHERE THE CHAPTER IS REGISTERED, NOT WHERE IT WORKS."* v1 raised this as a risk; the
  repo already knows it. Keep the caveat visible in anything published.
- **`chapter_level` distinguishes national / regional / local**, so Røde Kors's
  distrikt → lokalforening hierarchy is representable without modelling work. (Since done:
  317 Røde Kors lokalforeninger point at their distrikt, taken from rodekors.no's sitemap —
  see `README.md`.)

The 11 Tier A NGOs: Røde Kors, Norsk Folkehjelp, Frelsesarmeen, Kirkens Bymisjon,
Sanitetskvinnene, Nasjonalforeningen, LHL, Diabetesforbundet, Mental Helse, 4H,
Norges Speiderforbund. All have `has_chapters = true` and `chapter_count = 0`.

---

## 5. Scope decision (20 Sep 2026) — and what it now means

Agreed: Frivillighetsregisteret spine + stiftelser + ideelle AS/SA + trossamfunn; idrettslag out.

| Added population | Total | Already in spine | Net new |
|---|---|---|---|
| Stiftelser | 5 975 | 1 329 | **4 646** |
| Trossamfunn (næringskode 94.91) | 6 068 | 2 809 | **3 259** |
| Ideelle AS/SA (sektorkode 7000) | 422 | 4 | **418** |
| | | **Universe** | **81 138** |

**This scope now costs almost nothing**, because `brreg_enhet` already holds all 1.17 m units —
the three additions are filter predicates over data Atlas has, not new ingests. Two caveats
stand: ideelle AS/SA is implausibly small (19 AS, 403 SA), so the large ideelle care providers
are presumably registered as stiftelser — worth one spot check; and trossamfunn has no register
flag, so `naeringskode=94.91` is an approximation that must be labelled as derived.

**Still open: idrettslag.** 12 111 of the 72 815 spine orgs are sports clubs (16.6%), so
excluding them is an active deletion that makes every per-kommune coverage figure understate
voluntary presence by a sixth. **Recommendation: carry an `is_idrett` flag rather than
dropping.** One predicate downstream, reversible, and the sector control total stays intact.

---

## 6. The plan

### Phase 0 — Unblock `api.redcross.no` *(yours, internal)*

Find out whether the Organizations API backend is down, moved, or requires credentials the
gateway isn't passing. Everything about Røde Kors's own chapters and activities waits on this,
and no external source substitutes for it.

### Phase 1 — Chapter layer from Brreg *(mine, no dependencies, ~1 day)*

This runs **today**, without the Røde Kors API, using Atlas's own data. Verified query:

```
GET /brreg_enhet?navn=like.*RØDE KORS*&registrert_i_frivillighetsregisteret=is.true
→ 383 units
```

383 registered voluntary Røde Kors organisations, each with `kommune_nr`, ICNPO and active
status — Troms Røde Kors (17 employees, kommune 5503), Selbu, Gratangen, Tvedestrand. Enough to
populate `dim_chapter` for all 11 Tier A NGOs by name pattern.

Two independent affiliation signals, per this folder's standing rule that one source alone is
never enough:

1. **Name pattern** — `^(.+) RØDE KORS$`. High recall, known failure mode already documented in
   this folder (`Flyktninghjelpen` → *NTL avdeling 2-46*). Candidate generation only.
2. **Website hostname** — chapters declare affiliation themselves. Alta Røde Kors's Brreg record
   carries `hjemmeside: www.rodekors.no/lokalforeninger/finnmark/alta/`. Hostname match against
   the parent's domain is high-precision and free. The URL path even yields `chapter_level`.

**Deliverable:** `dim_chapter` rows for 11 NGOs with method + confidence per edge, plus a
measured precision figure. **Gate:** Røde Kors is the benchmark, because it is the one org whose
truth we can check — against the 383-row Brreg set now, and exactly against the API once Phase 0
lands. Below ~95% precision, the method changes before it touches the other ten.

### Phase 1b — Chapter directories from the NGOs' own sites *(mine, ~2 days)*

**Added 21 Sep 2026. v2 under-planned this**: website scraping appeared only as a one-line
mention of `cms_bins` inside the activity phase, and the website-hostname signal in Phase 1 only
reads the `hjemmeside` URL already stored in the Brreg record. Phase 1 *did* scrape rodekors.no,
but purely as ground truth for validation — never as a source. That was a mistake for three
reasons:

1. **For unitary NGOs the website carries most of the local presence.** Frelsesarmeen and
   Kirkens Bymisjon returned 1 and 3 Brreg rows from `enheter`. (⚠️ The claim that once stood
   here — that no registry method could ever find them — was wrong: their units are
   registered as `underenheter`, 175 and 151 of them. See `ngo-chapters-findings.md` §4.)
   The website still holds far more: Frelsesarmeen's site described **307** distinct units at
   the 21 Sep survey; after reconciliation the crawl side is **261** (BOTH 134 + SOURCE_ONLY
   127; 302 chapters with REGISTRY_ONLY 41). That covers 134 of the 175 registered sub-units
   (77%) and adds **127** services — Fretex shops,
   Gatehospitalet, Home-Start offices — that run under the national entity with no
   registration of their own.
2. **The websites hold more chapters than Brreg name-matching finds.** Sanitetskvinnene's
   sitemap lists **552** lokalforeninger against 464 Brreg matches.
3. **Brreg gives legal names and registered addresses.** Websites give display names, service
   areas and the activities each chapter runs — none of which is in any register.

**The route is sitemaps, not HTML scraping.** Surveyed 21 Sep 2026:

| NGO | Directory source | Units | Notes |
|---|---|---|---|
| sanitetskvinnene | `sitemap.xml`, `/lokalforening/*` | **552** | Exact. Drupal. Beats Brreg's 464 |
| kirkens-bymisjon | `robots.txt` → `tilbud-*` subsites | **≥99** | Each *tilbud* is a named service — this is the activity layer for a unitary NGO |
| mental-helse | `robots.txt` → per-lokallag subsites | **≥99** | WordPress multisite, one subsite per lokallag |
| redcross | 17 distrikt pages under `/lokalforeninger/` | 307 | Already scraped; **Trøndelag lists none** — different URL structure, unresolved |
| 4h | `/klubber/` | 200 OK | Not yet parsed |
| folkehjelp | `/lokallag` | 200 OK | Not yet parsed |
| speiderforbundet | `/finn-gruppe` | 200 OK | Small page — likely JS-rendered, check for an API |
| frelsesarmeen | `sitemaps-1-section-departments-1-sitemap.xml` | 1 | Wrong file or an index — **needs investigation** |
| lhl, diabetesforbundet, nasjonalforeningen | — | — | Not yet surveyed |

⚠️ **Both `robots.txt` listings returned exactly 100 lines**, which looks like a cap rather than
a true total. Treat 99 as a floor for Kirkens Bymisjon and Mental Helse and confirm against each
site's `sitemap_index.xml`.

*Status (Oct 2026): this survey is superseded — nine of the eleven are now crawled and
reconciled (all but Speiderforbundet and Røde Kors); see `README.md` and `ingest/README.md`.*

**Deliverable:** `ngo-chapters-web.csv` — chapter display name, URL, parent NGO, source site.
*(Never produced as a CSV: the crawls write `data/<slug>/chapters.crawl.json`, which
`reconcile` folds into `chapters.json`; neither the CSV nor the crawl files are currently on disk.)*
Then reconciled against the registry layer on name, producing a three-way status per chapter:
*both sources · Brreg only · website only*. Two independent sources agreeing is the confidence
rule this folder already runs on, and it turns the Røde Kors precision figure from an estimate
into a measurement for all eleven NGOs rather than one.

**Gate:** the reconciliation report. A chapter in both sources is high confidence; website-only
means a real chapter with no separate legal entity (expected for unitary NGOs); Brreg-only means
either a dormant unit or a website gap — the Trøndelag case shows both happen.

**Robots and rate limits:** all sitemaps are publicly advertised in `robots.txt`, which is the
site telling crawlers where its index is. Keep to ~1 req/s per host and identify the client.

### Phase 2 — Activity layer *(~3 days, partly blocked)*

Three inputs, by `chapter_data_shape`:

- **`api_canonical`** (Røde Kors) — the Organizations API. **Blocked on Phase 0.**
- **`cms_bins`** (9 NGOs) — their own CMS chapter pages, via the sitemaps surveyed in Phase 1b.
- **`programme_only`** (Nasjonalforeningen) — national programme catalogue, no per-chapter split.

Plus two cross-cutting sources:

- **frivillig.no** — undocumented but open: `POST https://www.frivillig.no/api/search/` with `{}`
  returned **3 064 active missions across 1 356 organisations** at first survey (3 063 declared
  at the 21 Sep harvest, 2 477 harvested), each carrying
  **organisasjonsnummer**, purpose tags, kommune/fylke and lat/lng. The only national source with
  activity × place × resolvable identifier. Opt-in and partial — a rich sample, never a census,
  and it must be labelled that way. Filter/pagination params still need extracting from the JS
  bundle; `{"query": ...}` was ignored.
- **`brreg_enhet.doc`** — the `aktivitet` free-text field on all 72 815 voluntary orgs. Alta Røde
  Kors self-describes as *"lokalforening med dertilhørende spesialforeninger som besøkstjeneste,
  hjelpekorps og barne/ungdomsarbeid."* Programme-level signal at full national coverage, already
  inside Atlas. Nothing else in Norway has this reach.

**Deliverable:** `dim_activity` + service-category mappings. **Gate:** classification is
AI-assisted, so sampled human review with a measured error rate is required, not optional (§8).

### Phase 3 — Scope filters and integration *(~1 day)*

The §5 scope as predicates over `brreg_enhet`, the `is_idrett` flag, and source manifests in the
existing contract shape.

---

## 7. What is genuinely missing vs. what only looks missing

| The brief asked for | Status |
|---|---|
| List of NGOs | ✅ 1 174 644 units; 72 815 voluntary, refreshed daily |
| What they focus on | ✅ at ICNPO category level (`kommune_ngo_summary`) |
| Where they are | ✅ `kommune_nr` on every unit |
| **Their named activities** | 🔴 `activity_catalog` empty |
| **Which chapters belong to which NGO** | 🔴 `dim_chapter` empty |
| **Activity × place** | 🔴 `kommune_local_chapters` empty |

The top half is done. The bottom half is the project — and it is precisely the half no public
Norwegian register contains, which is why it is worth building.

---

## 8. Compliance notes

⚠️ **Touches Røde Kors' AI-bestemmelser at three points.** Nothing is blocked; each needs a
deliberate decision.

**Personal data (bestemmelse 5).** Concrete, not theoretical: Brreg records for small lag carry
private mobile numbers, personal emails and `c/o` home addresses — Alta Røde Kors's record has a
mobile on it — and `brreg_enhet.doc` preserves *the complete upstream record with nothing
dropped*. frivillig.no returns a `contactPerson` on every organisation and mission. All lawfully
published, but aggregating them into a new searchable database is a different processing purpose
than the registers' own, which is what engages the rule.

> **Not followed for website contacts.** On the data owner's instruction (21 Sep 2026) the
> crawls keep published board contacts: `chapters.json` now holds 3 550 named contacts, 951
> with a private-domain e-mail, `isMasked: false` on all (542 N.K.S. names malformed — a known
> defect). See `README.md` § Personal data.

**Recommendation: drop person-level fields at ingest, not at query time** — the pattern
`../money/HOWTO-api-access.md` §C.7 already set for eInnsyn correspondents. Keep organisational email
(`alta@rodekors.org`), drop personal. **Worth checking what `doc` already holds**, since that
ingest has been running daily since before this decision.

**AI-generated classification (bestemmelse 6).** Phase 2 classifies free text into a taxonomy
using AI. The output is Røde Kors' responsibility however it was produced — so: sampled human
review, a measured error rate, and AI-classified fields marked as such so downstream users can
see it (bestemmelse 8, åpenhet).

**External publication (bestemmelse 7).** This API is publicly reachable and describes other
organisations' activities under a Røde Kors name. That is external communication about third
parties and needs a review round before the activity layer goes live.

**Ta kontakt med AI-ansvarlig** if unsure — particularly on the personal-data scope in `doc`,
which is the one that is already accumulating and hardest to unwind later.

---

## 9. Open questions

**Yours**
1. **Idrettslag** — `is_idrett` flag (recommended) or hard exclusion? (§5)
2. **Phase 0** — who owns `api.redcross.no`, and is the backend down or auth-gated? (§3)
3. **Tier B/C** — `dim_ngo` holds 11 Tier A orgs. Does this work extend the tier list, or fill
   the existing 11 first? Recommendation: fill 11 first, prove the method, then extend.
4. **`frr`** — registered, never run, internal-only. In scope or parked?

**Mine**
- `ref_atlas_service_category` is referenced throughout but not exposed via the API — need its
  contents before mapping activities
- frivillig.no search filter and pagination parameters
- Licence for frivillig.no bulk access — mail Frivillighet Norge, same pattern as
  `../money/HOWTO-api-access.md` §E
- Whether `ngo_overview.chapter_count = 0` is genuinely empty or a broken join
- Why `brreg-oppdateringer` shows 281 runs and `latest_row_count: 0`
