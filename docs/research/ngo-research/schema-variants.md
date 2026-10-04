# Variants observed across 11 Norwegian NGOs

**Purpose.** This is the evidence base for a chapter/activity schema meant to serve *all*
Norwegian NGOs, not one of them. Every axis below is something that genuinely differs
between organisations, with the measurement that establishes it and what the schema has to
do about it.

The governing constraint, established early and repeatedly confirmed: **no term is shared.**
Not one word for a local unit, an activity, or a role appears across all eleven. A schema
that adopts any organisation's vocabulary — including Røde Kors's — silently makes ten
others second-class.

Measured over 3 936 chapters and 158 activity definitions, 27 September 2026. Figures
re-checked against `data/` on 3 October 2026: **3 944 chapters** (excluding the 11 national
root rows; one N.K.S. placeholder page, `velg-forening-meg`, removed and one Røde Kors
district, Trøndelag, added from rodekors.no that day) and **200 activity definitions**; tables below carry the current figure where it changed.

---

## 1. Registration structure: federated vs unitary

The single most consequential split, and it decides which *registry endpoint* holds an
organisation's chapters at all.

| Type | Chapters are | Brreg endpoint | Organisations |
|---|---|---|---|
| **Federated** | separate legal entities, own orgnr | `enheter` | Røde Kors, 4H, Sanitetskvinnene, Speiderforbundet, LHL, Mental Helse, Diabetesforbundet, Folkehjelp, Nasjonalforeningen |
| **Unitary** | sub-units of one entity | `underenheter` (form `BEDR`) | Frelsesarmeen (175), Kirkens Bymisjon (151) |

A name search of `enheter` returns **1** row for Frelsesarmeen and **3** for Kirkens
Bymisjon. The same organisations have 175 and 151 sub-units. Conversely a federated
organisation's sub-units are back offices and depots, not chapters — Røde Kors has 20,
Sanitetskvinnene 6.

> **Schema implication.** `organizationNumber` must be **optional**, and the schema must not
> imply that a chapter is a legal person. `parent` and `level` carry the hierarchy instead.
> An ingest contract needs a per-organisation `structure` flag, because querying the wrong
> endpoint fails *silently* with a plausible small number rather than an error.

---

## 2. Unit of local presence: three different things are called a chapter

| Shape | Organisation | Evidence |
|---|---|---|
| **One page = one chapter** | NKS, Nasjonalforeningen, LHL, Folkehjelp, Diabetesforbundet, 4H | sitemap entry per unit |
| **One contact card = one chapter** | Frelsesarmeen | 139 pages → 316 cards → 307 distinct units in the raw crawl; **261** of them survive reconciliation as crawl-side chapters (BOTH 134 + SOURCE_ONLY 127), 302 chapters after joining the registry; `/lokalavdeling/oslo` alone carries 49 cards |
| **(service × place) = one chapter** | Kirkens Bymisjon | 144 services × 59 locations → **349 units** from the crawl (433 chapters after joining the registry); the registry confirms it, holding `I Jobb Fredrikstad`, `I Jobb Gjøvik`, `I Jobb Moss`, `I Jobb Oslo` as four sub-units |

> **Schema implication.** The chapter identifier cannot be assumed to correspond to a URL.
> `provenance.idOrigin` (`SOURCE` | `DERIVED`) records whether the source named the unit or
> the pipeline composed it. All 11 organisations carry `DERIVED` ids; only 3 (Frelsesarmeen,
> Kirkens Bymisjon, Nasjonalforeningen) have any the source named itself.

---

## 3. Tier vocabulary: same four levels, eleven sets of words

`level` normalises to `NATIONAL | REGIONAL | LOCAL | RELATED_ENTITY`. What each
organisation *calls* those tiers does not normalise:

| level | words observed |
|---|---|
| REGIONAL | distrikt, fylkeslag, krets, region, divisjon |
| LOCAL | lokallag, lokalforening, lokalavdeling, korps, klubb, speidergruppe, helselag, demensforening, sanitetsforening, sanitetslag, frivilligsentral |

> **Schema implication.** `level` is a closed enum — it is the only thing that is genuinely
> comparable across organisations. `chapterType` is a **free string** holding the
> organisation's own word, deliberately *not* an enum. A closed `chapterType` would force
> every organisation into one organisation's vocabulary.

---

## 3b. Hierarchy depth: three tiers is the common shape, but not universal

Røde Kors is national → **fylkeslag** → **lokallag**, with activities in the lokallag. Nine
of eleven organisations have that shape. What differs:

| org | NATIONAL | REGIONAL | LOCAL | middle tier is called |
|---|---:|---:|---:|---|
| speiderforbundet | 1 | 20 | 367 | krets |
| redcross | 1 | 20 | 354 | distrikt / fylkeslag |
| diabetesforbundet | 1 | 22 | 139 | fylkeslag |
| fire-h | 1 | 17 | 574 | fylkesorganisasjon |
| mental-helse | 1 | 15 | 184 | fylkeslag |
| nasjonalforeningen | 1 | 17 | 476 | fylkeslag |
| frelsesarmeen | 1 | 9 | 263 | **divisjon** |
| **kirkens-bymisjon** | 1 | **0** | 431 | **none — no middle tier at all** |

Not shown: `RELATED_ENTITY` rows (49 in all — Frelsesarmeen 30, Røde Kors 8,
Speiderforbundet 6, 4H 2, Kirkens Bymisjon 2, Sanitetskvinnene 1), which are not chapters.
Folkehjelp (1 / 3 / 125), LHL (1 / 18 / 267) and Sanitetskvinnene (1 / 4 / 570) follow the
three-tier shape.

Kirkens Bymisjon is a *stiftelse* delivering services, not a membership body governing
local chapters, so it has no governance tier to model. (Its regional presence is separate
foundations — `STIFTELSEN KIRKENS BYMISJON NORDLAND`, `... TROMSØ` — which are their own
legal entities, not a tier of one organisation.)

**Activities sit at LOCAL almost without exception: 971 of 975 chapters carrying
activities are LOCAL**, 4 are REGIONAL. Røde Kors's assumption generalises.

### ⚠️ Two problems with the tier data as it stands

**1. The middle tier is linked for seven organisations; Folkehjelp, Frelsesarmeen and
Speiderforbundet still link every chapter straight to the national root.** At the 27 September measurement, of 3 936 chapters **zero** had a `parent` pointing at a
REGIONAL row — the registry states no such link, and `brreg-chapters.ts` fills `parent`
with the national body, so the pipeline modelled a **two-level** hierarchy.

`upgrade-hierarchy.ts` has since recovered the link wherever a source states it, and infers
it where the tier follows county lines. **1 729 chapters** now point at a REGIONAL parent
(3 October 2026), each recording how in `provenance.parentMethod`:

| org | source of the edge | `parentMethod` | chapters |
|---|---|---|---:|
| fire-h | `/<fylke>/klubber/<klubb>` | URL_PATH | 455 |
| nasjonalforeningen | `/lokallag/<fylkeslag>/<lag>` | URL_PATH | 414 |
| redcross | rodekors.no sitemap, `/lokalforeninger/<distrikt>/<lag>` | SITEMAP_PATH | 317 |
| lhl | `/lokallag/<fylkeslag>/<lag>` | URL_PATH | 250 |
| mental-helse | chapter's municipality → county (Vestland left out: three rows claim it) | MUNICIPALITY_COUNTY | 133 |
| diabetesforbundet | `/fylkes-og-lokallag/<fylke>/<lag>` | URL_PATH | 127 |
| sanitetskvinnene | municipality → the one county body in the data (Rogaland) | MUNICIPALITY_COUNTY | 33 |

`MUNICIPALITY_COUNTY` edges carry `parentOrigin: INFERRED`; the others `SOURCE`. The 4H
RELATED_ENTITY row that once pointed at its fylke now points at the root — only LOCAL rows
are relinked. Røde Kors's site has merged Nord- and Sør-Trøndelag into one district the
register does not hold, so that district was added as an UNREGISTERED row, the same way
LHL's unregistered fylkeslag were; Rogaland's district (`ROGALAND RØDE KORS MED FLEKKEFJORD BY`)
was promoted from LOCAL on the evidence of its children.

For Folkehjelp, Frelsesarmeen and Speiderforbundet the edge is in no public source and the
tiers do not follow county lines (`Vestmarka krets`, `Østre divisjon`), so geography would
invent it — it has to come from the organisations.

**2. REGIONAL classification is unreliable in both directions.** It is inferred from words
in the name (`DISTRIKT|FYLKESLAG|FYLKE|KRETS|REGION`), which both misses and over-reaches:

- *missed* — `NORSKE KVINNERS SANITETSFORENING OSLO FYLKESFORENING` sits at LOCAL, because
  the pattern has `FYLKESLAG` but not `FYLKESFORENING`. Sanitetskvinnene shows 4 regional
  rows where the organisation really has a full county tier.
- *over-reached* — Frelsesarmeen's `Fosterhjem Region Midt/Sør/Vest/Øst` are promoted to
  REGIONAL, but they are a **service's** delivery regions, not a governance tier.

> **Schema implication.** `parent` must be able to point at the immediate tier above, not
> just the national body, and `level` must not be inferred from a name pattern when the
> organisation can state it. A tier that exists in reality but is unlinked in the data is
> worse than one that is absent, because a consumer will read the flat structure as fact.

---

## 3c. Not every chapter is a place

Røde Kors lokallag are geographic. Two organisations put non-geographic units at the same
level:

| org | non-geographic | examples |
|---|---:|---|
| lhl | 29 of 285 (re-counted by name 3 Oct; 31 of 274 on 27 Sep). Several look like a registry row and a website row for the same unit — `LHL Afasiforeningen Trøndelag` / `LHL AFASIFORENINGEN I TRØNDELAG` | `LHL Afasiforeningen Trøndelag`, `LHL Hjerneslag og Afasi Oslo og Akershus`, `LHL Alfa-1`, `LHL Covid-19` |
| kirkens-bymisjon | 26 of 433 | `Fri – barn og familie, Arendal` |
| folkehjelp | 10 of 128 | `Norsk Folkehjelp Solidaritetsungdom Arendal` |

LHL's are **diagnosis-based interest groups** — a person joins because of a condition, not
a postcode. Several are national with no place at all (`LHL Alfa-1`, `LHL Covid-19`).

> **Schema implication.** A chapter must be valid with **no** municipality, county or
> coordinates, and `chapterType` has to carry the distinction, since `level` cannot: a
> diagnosis group and a geographic lokallag are both LOCAL.

---

## 4. `chapterType` cardinality: 1 to 15 distinct values per organisation

| org | distinct | values |
|---|---:|---|
| frelsesarmeen | **15** | Korps 87, Virksomhet 68, Rusomsorg 59, Seksjon for oppvekst 42, Fretex 28, Barnehager 4 … |
| kirkens-bymisjon | **13** | Virksomhet 137, Arbeidsinkludering 117, Barn, unge og familier 69, Nærmiljø 37 … |
| nasjonalforeningen | 5 | Helselag 417, Demensforening 39, Lokallag 20, Fylkeslag 15, Fylkesstyret 1 |
| sanitetskvinnene | 5 | Sanitetsforening 523, Sanitetslag 46, Unge Sanitet 2, Fylke 1, Krets 1 |
| redcross | 4 | Lokalforening 306, Hjelpekorps 52, Besøkstjeneste 3, Omsorg 2 |
| diabetesforbundet | 4 | Lokallag 114, + *hvilende* 21, + *nedlagt* 4, Fylkeslag 1 |
| lhl | 2 | Lokallag 267, Fylkeslag 11 |
| folkehjelp | 2 | Lokallag 125, Region 1 |
| fire-h | 2 | Klubb 576, Fylkeslag 1 |
| speiderforbundet | 2 | Speidergruppe 373, Krets 20 |
| mental-helse | 1 | Lokallag 184 |

Counts exclude the national root and rows with no `chapterType` (mostly REGIONAL rows from
the registry: Diabetesforbundet 21, Røde Kors 18, 4H 16, Mental Helse 15, LHL 7). The
second value for the federated organisations is almost always the county tier's own word.

Both 15-value organisations get their vocabulary from the same place: the unit name is
written `<brand> <service area>, <unit>`, in the registry (`FRELSESARMEENS RUSOMSORG AVD
BAKKEGATEN`) and on the website (`Frelsesarmeens rusomsorg, Bakkegaten`) alike. Parsing
that split is what makes the two sources join.

> **Schema implication.** Free string, no enum, no maximum cardinality. An organisation's
> own filing vocabulary is data, not noise.

---

## 5. Identifier: published, absent, or wrong

| Case | Count | Organisation |
|---|---:|---|
| orgnr printed on the page | 116 distinct | Frelsesarmeen |
| orgnr from the registry only | all others | — |
| **page prints the *national* orgnr instead of its own** | 2 cards | Frelsesarmeen (`938498318`) |

> **Schema implication.** Any organisation number must be validated as **exactly nine
> digits** *and* checked against the parent's own number before being used as a join key.
> Accepting the national number collapses distinct units onto the national entity —
> a merge that produces no error and looks like successful matching.

---

## 6. Contacts: six shapes, and the field coverage is nothing alike

| org | people | role | name | jobTitle | email | phone |
|---|---:|---:|---:|---:|---:|---:|
| lhl | 1 908 | ✅ | ✅ | — | **0** | 1 885 |
| diabetesforbundet | 663 | ✅ | ✅ | — | 650 | 662 |
| sanitetskvinnene | 542 | ✅ | ⚠️ malformed | — | 412 | 530 |
| nasjonalforeningen | 414 | ✅ | 399 | — | **15** | 414 |
| frelsesarmeen | 19 | ✅ | ✅ | **18** | 17 | **0** |
| mental-helse | 4 | ✅ | ✅ | — | 4 | **0** |
| folkehjelp, fire-h, redcross, speiderforbundet, kirkens-bymisjon | **0** | — | — | — | — | — |

Role vocabulary differs too: *Leder / Medlem / Kasserer / Sekretær / 1. varamedlem /
korpsleder / kontaktperson*. Frelsesarmeen is the only organisation publishing a **rank**
(`Major`, `Kaptein`) — hence `jobTitle` separate from `role`.

Five organisations publish **no** contacts at all. One (Folkehjelp) embeds a private
individual inside the postal address instead: `c/o <a volunteer's name>`.

> **Schema implication.** Every contact field except `role` must be optional, and
> `contacts` itself must be absent-not-empty. `provenance.containsPersonalData` has to be
> derivable from the *address* too, not only from a contact block.

⚠️ **N.K.S. names are malformed.** All 542 Sanitetskvinnene contacts carry `givenName`
`"field--type-string"` and the real name inside raw HTML in `familyName` — a parser bug
(capture started mid-tag), fixed in `nks-chapters.ts` on 3 Oct 2026; the data needs a
re-crawl to repair. Phones and e-mails were parsed correctly. Schema validation passed
throughout, because both are valid strings.

⚠️ **Aggregation risk.** 3 550 named individuals, 3 491 phone numbers (most of them personal
mobiles), and **951** e-mail addresses on private/ISP domains — Diabetesforbundet 560,
Sanitetskvinnene 379, Nasjonalforeningen 12 (gmail 467, hotmail 148, online.no 142,
outlook 54 across the dataset). An earlier count of 528 covered Diabetesforbundet alone.
Each page is public; the compiled register is a different artefact. `Contact.isMasked`
exists for this and is currently `false` everywhere.

---

## 7. Activities: four shapes, and most organisations publish none

| Shape | Organisation | Measurement |
|---|---|---|
| National catalogue + local instances | Sanitetskvinnene | 14 definitions (12 NATIONAL, 2 LOCAL) over 649 provisions |
| Branded family list | Nasjonalforeningen | *"Med oss"*-aktiviteter, 470 provisions / 6 definitions |
| Per-unit list linking to a catalogue page | Frelsesarmeen | 38 provisions / 36 definitions, **all with description** |
| **Service-first**, place is the attribute | Kirkens Bymisjon | 144 definitions × locations → 349 provisions |
| None published | LHL, Folkehjelp, Diabetesforbundet, 4H, Mental Helse, Røde Kors, Speiderforbundet | — |

Note the inversion: for Kirkens Bymisjon the *service* is primary and the place is a
taxonomy term on it. For everyone else the *chapter* is primary and activities hang off it.

> **Schema implication.** `ActivityDefinition` must be a first-class resource with its own
> identity, not a nested array on Chapter. Both directions of the relationship have to be
> expressible, and `origin` (`NATIONAL | LOCAL | UNKNOWN`) must be stated with evidence
> rather than inferred, because it varies widely: of the definitions chapters actually use,
> 2 of 7 are LOCAL for N.K.S., 34 of 36 for Frelsesarmeen, 103 of 144 for Kirkens Bymisjon.

---

## 8. Service category: one organisation in eleven publishes a taxonomy

| assignmentMethod | definitions | source |
|---|---:|---|
| `SOURCE_TAXONOMY` | 144 | Kirkens Bymisjon `tilbud-type` — 9 categories |
| `UNMAPPED` | 56 | Sanitetskvinnene 14, Frelsesarmeen 36, Nasjonalforeningen 6 — no taxonomy published |

Kirkens Bymisjon's nine: *Nærmiljø, Arbeidsinkludering, Barn, unge og familier, Bærekraft,
Rettighetsarbeid, Rusomsorg, Mangfold, Helse og behandling, Eldre.*

External candidates already surveyed: **ICNPO** as Brreg applies it (12 UN groups + 2
Norwegian-only: *Barne- og ungdom*, *Mangfold og inkludering*), multi-valued for 24% of
organisations; SSB's satellite-account variant; the UN ICNP/TSO crosswalk.

> **Schema implication.** `serviceCategory` needs `assignmentMethod`
> (`SOURCE_TAXONOMY | MANUAL | AI_ASSISTED | UNMAPPED`), `confidence`, and reviewer fields.
> A category assigned by a pipeline and one published by the organisation must never be
> indistinguishable to a consumer.

---

## 9. Fields only one or two sources can supply

| field | sources | detail |
|---|---:|---|
| **coordinates** | **1 of 11** | Sanitetskvinnene, 548 chapters |
| **memberCount** | **2 of 11** | Nasjonalforeningen 366 chapters / 30 318 members; Mental Helse 4, stated in prose (*"over 1800 medlemmer"*) |
| `sourceUpdatedAt` | **2 of 11** | Kirkens Bymisjon 282 (WordPress `modified`), 4H 98 (`og:article:modified_time`) |
| `county` | 2 of 11 | Nasjonalforeningen 120, 4H 98 — derived from URL path, not published as a field |
| `address` | 4 of 11 | Frelsesarmeen 302, Kirkens Bymisjon 151, Folkehjelp 113, NKS 544 |

> **Schema implication.** These cannot be required, and their absence must be expressible
> without a null. **No member count exists in any registry** — it is only ever the
> organisation's own claim, so it needs provenance of its own.

---

## 10. Lifecycle: status lives in two incompatible places

| Where | Organisation | Example |
|---|---|---|
| Registry fields (`isActive`, `terminatedDate`) | all federated | — |
| **Encoded in the chapter's NAME** | Diabetesforbundet | `Flekkefjord og omegn NEDLAGT`, `Iveland, Evje og Hornnes HVILENDE` |

25 of 161 Diabetesforbundet chapters carry status in the name. Left there it also defeats
registry matching, since the registry name has no such suffix.

> **Schema implication.** `isActive` must be settable from a parsed name, and the cleaned
> name stored separately from the legal one (`name` vs `legalName`).

---

## 11. Geography: five ways to say where

municipality number (registry, 8 of 11) · coordinates (1) · county from URL path (2) ·
location taxonomy term (Kirkens Bymisjon) · postal place only.

`provenance.municipalityMethod` already distinguishes
`SOURCE | REGISTRY | POINT_IN_POLYGON | POSTAL_CODE_LOOKUP | NAME_MATCH | NONE`.

⚠️ **Not every unit of a Norwegian NGO is in Norway.** Frelsesarmeen operates
`Akureyri korps`, `Reykjavík korps` and `Torshavn korps`. These have no Norwegian
organisation number and no municipality, and they are not errors.

> **Schema implication.** `municipalityNumber` optional; no assumption that address country
> is Norway; `RELATED_ENTITY` is not the right level for a foreign chapter — it is a real
> LOCAL unit outside the national register.

---

## 12. Source platform: six, and it dictates what is obtainable

| Platform | Organisation | Access |
|---|---|---|
| WordPress REST, custom post type | Nasjonalforeningen (`local_branch`), Kirkens Bymisjon (`tilbud`) | **API — no scraping** |
| WordPress multisite, one site per chapter | Mental Helse | 99 subsites, listed only in `robots.txt` |
| Craft CMS sitemaps | Frelsesarmeen, Folkehjelp | section sitemaps |
| Enonic sitemaps | LHL, Diabetesforbundet | one content sitemap |
| Flat sitemap | 4H | 6 365 URLs, 457 klubber |
| **Unavailable** | Speiderforbundet (no sitemap), Røde Kors (directory API 500) | registry only |

> **Schema implication.** `Extract.method` (`API | REST_API | SITEMAP_CRAWL | HTML_CRAWL |
> MANUAL`) belongs on every collection, because a consumer's trust in a field should depend
> on how it was obtained.

---

## 13. Reconciliation: neither source is sufficient, for anyone

| | registry | crawl |
|---|---|---|
| holds | orgnr, municipality, legal status, establishment date | coordinates, activities, contacts, member counts, real address |
| misses | everything a register does not collect | orgnr — except Frelsesarmeen |

Across 3 944 chapters: **BOTH 1 784 · REGISTRY_ONLY 1 283 · SOURCE_ONLY 877** (3 October
2026; national root rows excluded; the one Røde Kors SOURCE_ONLY row is its sitemap-stated
Trøndelag district).

`SOURCE_ONLY` is not noise. Frelsesarmeen's 127 and Kirkens Bymisjon's 282 are Fretex
shops, Gatehospitalet, Home-Start offices — real local presence run under the national
entity with no registration of its own.

> **Schema implication.** `reconciliation` (`BOTH | SOURCE_ONLY | REGISTRY_ONLY |
> UNRECONCILED`) must be on every chapter. A consumer filtering for "real" chapters needs
> to know which of the two sources saw it.

---

## 14. Freshness: three clocks, and only two organisations offer the second

`fetchedAt` (our pipeline) · `sourceUpdatedAt` (upstream, 2 of 11) · `assertedAt` (when the
owner last confirmed — the only one a user cares about).

4H's timestamps show the point: klubb pages last modified in 2023 sit beside others from
2026. ICNPO classifications are 9.6 years old at the median with 100% coverage — complete
and stale at once.

> **Schema implication.** Never backfill `assertedAt` from `fetchedAt`. Absent must mean
> *never confirmed*, because the alternative is a dataset that looks fresh everywhere.

✅ **Fixed 3 Oct 2026.** The data had broken this rule: 6 936 of 8 546 `assertedAt` values
equal the record's own fetch date — the extractors stamped the crawl date as the assertion
date in every crawled organisation (4H only 2). The six extractors no longer do; the values
were removed (N.K.S. blocks that called themselves FRESH on that basis are now UNKNOWN); the
1 610 that remain are source-stated page dates (Kirkens Bymisjon, 4H); and
`check:integrity` fails on any backfill.

---

## What this means for a shared schema

1. **Closed enums only where meaning is genuinely shared** — `level`, `reconciliation`,
   `confidence`, `origin`, `assignmentMethod`. Everything organisation-specific
   (`chapterType`, activity names, roles) is a free string.
2. **Almost everything is optional.** The only fields present for all 3 944 chapters are
   `id`, `href`, `name`, `level`, `organization`, `parent`, and the pipeline-written `provenance`,
   `registration` and `unitKind` — i.e. nothing a source is obliged to publish beyond a name.
3. **Provenance is not metadata, it is payload.** Which source, how matched, how the
   municipality was determined, whether it holds personal data.
4. **Omit, never null** — with this much optionality, `null` would dominate every response.
5. **Activity is a first-class resource**, because one organisation in eleven inverts the
   relationship entirely.
6. **The schema must survive a chapter that is not a legal person, not in Norway, has no
   coordinates, no contacts and no activities** — and that is the common case, not the edge.
