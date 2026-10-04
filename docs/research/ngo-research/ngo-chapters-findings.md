# Phase 1 findings: the chapter layer

Built 20 September 2026 against the live Atlas API and Brønnøysund. Two data files:
`data/<slug>/chapters.json` (2 754 rows at the time of writing) and
`_all-municipality-coverage.csv` (358 rows; not currently on disk).

> **Superseded figures.** The tables in §1, §5, §6 and §9, and the caveats in §8, are the
> 20 Sep registry-only run. After crawl reconciliation, sub-units and the hierarchy upgrade
> the dataset holds **4 021 chapters** (4 Oct 2026) (excluding the 11 national roots), nine of eleven
> organisations joined from two sources — see `README.md` for current counts.

Built **without** `api.redcross.no`, which is still returning HTTP 500 (see
`ngo-activity-map-strategy.md` §3). Everything here comes from Atlas's own `brreg_enhet`
plus the public rodekors.no directory used as ground truth.

---

## 1. What was produced

**`data/<slug>/chapters.json`** — one record per candidate chapter of the 11 Tier A NGOs.

| | |
|---|---|
| Rows | **2 754** |
| Levels | 2 608 local · 117 regional · 11 national · 18 related_entity |
| Confidence | 1 314 high · 1 287 medium · 153 low |
| With `kommune_nr` | 2 393 (87%) |

| NGO | rows | high | medium | low |
|---|---|---|---|---|
| fire-h | 495 | 262 | 217 | 16 |
| sanitetskvinnene | 464 | 265 | 199 | 0 |
| speiderforbundet | 394 | 268 | 114 | 12 |
| redcross | 382 | 188 | 194 | 0 |
| nasjonalforeningen | 372 | 50 | 200 | 122 |
| lhl | 229 | 85 | 141 | 3 |
| mental-helse | 189 | 118 | 71 | 0 |
| diabetesforbundet | 118 | 36 | 81 | 1 |
| folkehjelp | 108 | 45 | 63 | 0 |
| kirkens-bymisjon | 3 | 2 | 1 | 0 |
| frelsesarmeen | 1 | 1 | 0 | 0 |

**`_all-municipality-coverage.csv`** — one row per active municipality, with a column per NGO.
*(Not currently on disk; the §6 figures come from the 20 Sep run.)*

---

## 2. Method

Two independent signals per candidate, per this folder's standing rule that one source alone
is never enough:

1. **Name pattern** — per-NGO regex with explicit exclusions, over `brreg_enhet.navn`.
2. **Corroboration** — the chapter's own `hjemmeside` hostname matching the parent's domain,
   or the parent's brand appearing in the free-text `aktivitet` field.

Confidence: **high** = strong name pattern *and* corroboration · **medium** = strong name
pattern alone, or weak pattern with corroboration · **low** = weak pattern only.

Two normalisation traps worth recording, because both silently produce zero matches:

- **`Ø`, `Æ`, `Å` do not decompose under Unicode NFKD.** `unicodedata.normalize('NFKD', 'RØDE')`
  → ASCII-fold → `RDE`, not `RODE`. A pattern for `RODE KORS` matched **zero** of 383 real
  Røde Kors units until the letters were mapped explicitly *before* NFKD. Any Norwegian name
  matching that skips this step fails silently rather than loudly.
- **The Brreg API rejects `frivilligRegistrert`**; the supported parameter is
  `registrertIFrivillighetsregisteret`.

---

## 3. Measured accuracy (Røde Kors)

Ground truth: 307 Røde Kors units scraped from the 17 public distrikt pages on rodekors.no.

| Measurement | Precision | Note |
|---|---|---|
| All local candidates | 83.3% | raw |
| Minus RK-owned AS/stiftelser | 85.2% | they are not chapters — reclassified, not errors |
| Minus Trøndelag | **93.6%** | ground truth does not exist for Trøndelag |

**Recall: 95.4%** — of website-listed units, 95.4% were found in Brreg.

Both corrections are legitimate, and here is why:

- **RK-owned companies are not chapters.** `RØDE KORS HAUGLAND REHABILITERINGSSENTER AS`,
  `BERGEN RØDE KORS SYKEHJEM AS`, `STIFTELSEN RØDE KORS NORDISK UNITED WORLD COLLEGE` and 15
  others are `organisasjonsform` AS or STI. They are real Røde Kors entities but not
  lokalforeninger, so they are now `chapter_level = related_entity` rather than counted wrong.
- **The Trøndelag distrikt page lists no chapters at all.** `/lokalforeninger/trondelag/`
  contains only navigation links (`aktiviteter`, `aktuelt`, `finn-fram`, `kontakt`). Its
  lokalforeninger sit behind a different URL structure. Trondheim, Steinkjer, Levanger, Namsos,
  Verdal, Stjørdal, Meråker, Snåsa and Selbu Røde Kors are all real and all absent from ground
  truth. Scoring them as false positives measures my scraper, not the matcher.

The 20 still unconfirmed after both corrections are dominated by **name-order and spelling
variants**, not wrong organisations — `RØDE KORS FAUSKE` vs the site's *Fauske Røde Kors*,
`DRØBAK/FROGN` vs *Drøbak og Frogn*. Two are genuine non-chapters (`RØDE KORS BRUKTBUTIKK`,
`RØDE KORS SENIORFORUM` — activity units, not lokalforeninger).

So **93.6% is a floor, not an estimate.** The Phase 1 gate was ~95%; this is marginally under
it on a ground truth known to be incomplete. Recommendation: accept for `high`/`medium` rows
and re-measure against `api.redcross.no` once it is back, which is the only exact check.

---

## 4. The structural finding: federated vs unitary NGOs

The single most important result, and it was not in the plan.

**Frelsesarmeen returned 1 row. Kirkens Bymisjon returned 3.** Not a matching failure — these
organisations do not register their local work as separate legal entities. Compare Røde
Kors's 382 and 4H's 495.

Norwegian NGOs split into two structural types, and the split determines which registry
endpoint holds their chapters:

| Type | Chapters are | Registered as | Examples |
|---|---|---|---|
| **Federated** | independent legal entities, own orgnr | `enheter` | Røde Kors, 4H, Sanitetskvinnene, Speiderforbundet, LHL, Mental Helse, Diabetesforbundet, Folkehjelp, Nasjonalforeningen |
| **Unitary** | internal units of one entity | `underenheter` (BEDR) | Frelsesarmeen, Kirkens Bymisjon |

### ⚠️ Correction: "unitary chapters are invisible in Brreg" was wrong

This section previously concluded that for the two unitary NGOs **no registry-based method
can ever work**, because their chapters "have no legal existence". That conclusion was
reached from a single number — 1 row for Frelsesarmeen — and it is false.

Their local units *are* in Brreg. They are registered as **`underenheter`** (sub-units,
`organisasjonsform = BEDR`) hanging off the parent entity, in an endpoint this project had
never queried. `brreg-chapters.ts` searches `enheter` only, so it could not have seen them:

| organisation | `enheter` (what we had, 20 Sep) | `underenheter` (what we missed) |
|---|---:|---:|
| Frelsesarmeen | 1 | **175** |
| Kirkens Bymisjon | 3 | **151** |
| Røde Kors | 382 | 20 |
| 4H | 495 | 17 |
| Nasjonalforeningen | 372 | 8 |
| Sanitetskvinnene | 464 | 6 |

The federated organisations' handful of sub-units are back offices and depots, not chapters —
which is why this endpoint is queried only for the unitary ones, by an explicit list in
`brreg-subunits.ts` rather than for every NGO.

**How the error survived.** The 1 and the 3 were real, and they had a tidy explanation that
also matched an independent signal: `dim_ngo` tagged both organisations `chapter_data_shape =
cms_bins`, which was read as confirmation. It confirmed only that their chapters are in the
CMS, not that they are absent from the registry. A single count plus a plausible story is not
evidence, and a second source agreeing with a conclusion is not the same as a second source
testing it.

### What the two structures actually are

Not "visible" versus "invisible" — two registration shapes, each needing the endpoint that
matches it. `overordnetEnhet` is a declared parent link, so the sub-unit route involves **no
name matching and no fuzzy threshold**: precision is 100% by construction, against the 93.6%
measured for the name-matched federated route.

`has_chapters = true` with `chapter_count = 0` was never contradictory for these two. They
have chapters; those chapters are sub-units rather than organisations.

## 5. False positives caught, and one that would have been serious

**Norges Speiderforbund vs KFUK-KFUM-speiderne.** A plain `SPEIDER` match returns 565 units,
of which **169 belong to KFUK-KFUM-speiderne — a different national organisation entirely.**
Unfiltered, nearly a third of Speiderforbundet's chapters would have been another NGO's. This
is the same failure class this folder already documented for Brreg name search
(`Flyktninghjelpen` → *NTL avdeling 2-46*), and it is why the two-signal rule exists.

Also excluded: support bodies that carry the brand but are not chapters —
`ROLVSØYSPEIDERNES FORELDREFORENING`, venneforeninger, støtteforeninger.

**The weakest NGO in the set is Nasjonalforeningen** — 122 of 372 rows are `low` confidence,
because many of its lokallag are named simply `<place> HELSELAG` with no national-brand token.
`NASJONALFORENINGEN OS HELSELAG` is unambiguous; `BYGSTAD HELSELAG` is not. Treat those 122 as
candidates for review, not as facts.

---

## 6. Coverage: where the 11 NGOs actually are

| | |
|---|---|
| Active kommuner | 358 |
| With ≥1 of the 11 NGOs | **343 (96%)** |
| With none | **15** |

| NGOs present | Kommuner |
|---|---|
| 0 | 15 |
| 1–2 | 82 |
| 3–4 | 136 |
| 5–6 | 70 |
| 7–9 | 55 |

**The 15 kommuner with no chapter of any of the 11:** Sokndal, Kvitsøy, Utsira (Rogaland);
Træna, Evenes, Røst, Værøy, Flakstad (Nordland); Iveland, Bykle (Agder); Modalen, Fedje,
Solund (Vestland); Sørreisa (Troms). Small and mostly island or inland kommuner — the pattern
is unsurprising, but the list is now explicit rather than assumed.

Broadest coverage: Oslo, Stavanger, Kristiansand, Ringsaker, Stjørdal, Bodø and Namsos all
have 9 of 11. Oslo has the most chapters (57), then Bergen (43) and Trondheim (37).

🔴 **Read this as registered address, not service area.** `kommune_nr` is where the chapter is
registered — the caveat Atlas already carries in `kommune_local_chapters`. A chapter in a
neighbouring kommune may well serve one counted here as empty.

**359 chapter rows (13%) have no `kommune_nr` at all** and are excluded from the coverage
counts. They are in `chapters.json` with no municipality field, not dropped.

---

## 7. The `doc` personal-data audit

Measured across all 72 815 voluntary organisations in `brreg_enhet`, exact counts:

| Field in `doc` | Orgs | Share |
|---|---|---|
| `mobil` present | **36 784** | 50.5% |
| `c/o` in forretningsadresse | 30 413 | 41.8% |
| `c/o` in postadresse | 10 265 | 14.1% |
| `c/o` in either | 39 477 | 54.2% |
| **`mobil` OR `c/o` — the person-data footprint** | **56 835** | **78.1%** |
| `epostadresse` present | 41 732 | 57.3% |
| `aktivitet` free text present | 72 815 | 100% |

**78% of voluntary organisations in Atlas carry person-level data in `doc`.** A `c/o` line is
a named private individual, usually at a home address — *"c/o <a volunteer's name>, <their home address>"* (example redacted).
A `mobil` on a small lag is a private number; organisations use `telefon`.

**I could not reliably classify email as personal vs organisational.** Domain and name-overlap
heuristics both produced obvious errors in each direction (`<name>@hotmail.com` is the
club's address; a `kommune.no` address may be a named employee's). Reporting a percentage here
would be false precision. The safe assumption is that a meaningful share of the 41 732 are
personal.

None of this is unlawful — Brreg publishes it. But `doc` stores *"the complete upstream record
with nothing dropped"*, the ingest runs daily, and aggregating this into a searchable database
is a different processing purpose than the register's own. That is what engages bestemmelse 5.

~~**Neither output file in this folder contains any person-level field.**~~ True of the
20 Sep registry-only run; **no longer true.** The website crawls since then extract published
board contacts: `chapters.json` now holds **3 550 named contacts** across six organisations
(LHL, Diabetesforbundet, Sanitetskvinnene, Nasjonalforeningen, Frelsesarmeen, Mental Helse),
951 of them with an e-mail on a private consumer/ISP domain, and `isMasked` is `false` on
every one. The 542 Sanitetskvinnene names are malformed by a parser bug (fixed in code, not
yet in the data). See `README.md` § Personal data.

⚠️ **Recommendation: decide what `doc` should retain, and ta kontakt med AI-ansvarlig before
the activity layer is published.** The daily ingest means this accumulates whether or not a
decision is taken.

---

## 8. Caveats

- **Precision is measured for Røde Kors only.** *As of 20 Sep.* Since then nine organisations
  have been reconciled against their own directories (BOTH 2 419 of 4 021 chapters, 4 Oct 2026), which is
  independent confirmation per chapter, but no second precision figure has been computed.
  Røde Kors itself remains registry-only. Do not assume 93.6% transfers — Nasjonalforeningen
  is visibly weaker (§5).
- **Ground truth is a scrape of rodekors.no**, itself incomplete (Trøndelag). The exact check
  needs `api.redcross.no`.
- `is_idrett` was set from `naeringskode1_kode` prefix `93.1` in the 20 Sep Python output. No
  chapter of these 11 NGOs was flagged. *The field did not survive the move to the current
  schema* — there is no idrett flag in `Chapter` or the data; the recommendation stands in
  `ngo-activity-map-strategy.md` §5.
- **Sanitetsforeninger are assumed to be N.K.S.-affiliated.** Most are. Not all will be. *At
  20 Sep* none of the 464 was independently confirmed; since the site crawl, 439 are BOTH
  (registry and the organisation's own directory agree).
- Chapter names come from Brreg, so they are legal names, not display names —
  `LILLEHAMMER RØDE KORS LOKALFORENINGEN`, not *Lillehammer Røde Kors*.
- Nothing here has been written to Atlas. These are files for review.

---

## 9. Next

1. **Unblock `api.redcross.no`** — still the highest-value single fix, and it converts Røde
   Kors's 382 inferred rows into authoritative ones plus an exact precision measurement.
2. **Review the 153 `low`-confidence rows**, 122 of which are Nasjonalforeningen helselag.
3. **Decide the `doc` retention question** (§7) before Phase 2 publishes anything.
4. **Phase 1b — scrape the NGOs' own chapter directories** (added to the strategy 21 Sep after
   this was written). The websites are a second independent source — not, as first written
   here, the *only* source for the two unitary NGOs; see the §4 correction. Sanitetskvinnene's sitemap lists **552** lokalforeninger against the 464
   found here; Kirkens Bymisjon exposes ≥99 named `tilbud-*` services. Reconciling the two
   sources turns the single Røde Kors precision figure into a measurement for all eleven.
5. **Phase 2 — activities.** The `aktivitet` free text is present on **100%** of the 72 815
   voluntary orgs, and frivillig.no adds 3 063 declared missions (2 477 harvested 21 Sep) with orgnr. Both are ready.
