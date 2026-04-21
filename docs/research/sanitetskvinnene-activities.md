# Sanitetskvinnene (N.K.S.) activities

The canonical activities offered by Norske Kvinners Sanitetsforenings (N.K.S., brand "Sanitetskvinnene") lokalforeninger, derived from a sample scrape of the public chapter pages under `https://sanitetskvinnene.no/lokalforening/{slug}` on 2026-04-18, cross-checked against a Brønnøysundregistrene query the same day.

## Source and method

- **Primary source**: the chapter finder `https://sanitetskvinnene.no/lokalforening` (paginated, 55 pages × 10 entries = ~550 chapters) and individual chapter pages `https://sanitetskvinnene.no/lokalforening/{slug}`.
- **Scale**: N.K.S. reports 550 lokalforeninger and 45 000+ members ([home page](https://sanitetskvinnene.no/)). Brreg confirms 525 FLI "sanitetsforening" + 55 FLI "sanitetslag" = **580 active foreninger/lag** in the Enhetsregister, 470+51 = **521 in Frivillighetsregisteret**. The 30-chapter delta between 580 Brreg and 550 website is explained by (a) the central entity plus fylkesledd (Rogaland fylke, etc.) being counted in Brreg but not as lokalforeninger, and (b) some dormant/recently-folded chapters.
- **Sample**: 50 chapter pages fetched via WebFetch; 38 had at least one activity listed, 12 returned only contact details ("empty" activity section). Sampled across alphabetical front-of-list (A–B), geographic spread (Oslo, Bergen, Trondheim area, Tromsø area, Agder, Rogaland, Nordland, Finnmark, Innlandet, Trøndelag, Vestland, Møre og Romsdal), and deliberately included the 4 Kvinnehelsehus-operating chapters (Oslo, Bergen, Drammen, Kristiansand) and the 10 employee-bearing chapters surfaced in Brreg.
- **Note on derivation**: N.K.S. chapter pages render from a central CMS with a **fixed activity vocabulary of ~7 labels** — much closer to Norsk Folkehjelp's shallow-taxonomy pattern than Red Cross's 2 407 free-text local names. The canonical set observed: `Omsorgsber.` (Omsorgsberedskap), `Kløvertur`, `Språkvenn`, `Lesevenn`, `Sisterhood`, `Dig In`, `Ressursvenn`. Activity tiles are uniform in wording and ordering across chapters — the chapter either has the tag or it doesn't. No free-text per-chapter activity names exist in the finder.
- **Caveats**: "Empty" activity sections likely mean the chapter has not tagged any activity in the CMS, not necessarily that the chapter is inactive — 4 of the 12 empty-tagged chapters have a registered leder with a recent mobile number. Linear extrapolation from 50 → 550 is used, flagged where applied. Member counts per chapter are not exposed on the chapter page. Founding year is not on the chapter page — it lives in Brreg `stiftelsesdato`.

## Activities, by chapter footprint

Ordered by how many sampled chapters tag each canonical area. Counts are from the 50-chapter sample; the "Extrapolated to 550" column scales linearly; both columns should be read as order-of-magnitude signals, not authoritative national footprint.

| Activity | In sample (n=50) | Extrapolated to 550 | What it is |
|---|---:|---:|---|
| **Omsorgsber.** (Omsorgsberedskap) | 33 | ~360 | Volunteer emergency-preparedness groups — the N.K.S. equivalent of a local civil-defence reserve. Training in first aid, evacuation, and crisis support for flooding, wildfires, landslides, evacuation reception. The primary beredskap capability. |
| **Kløvertur** | 25 | ~275 | Outdoor-activity programme (walks, nature outings, adapted friluftsliv) for members and the broader local community. Low-threshold, recurring, inclusive. |
| **Språkvenn** | 14 | ~155 | One-to-one / small-group language practice for minority women living in Norway — "et tilbud til minoritetskvinner i alle aldre bosatt i Norge". Direct functional peer to Red Cross's Norsktrening. |
| **Lesevenn** | 5 | ~55 | Volunteers reading aloud to children, typically in schools, barnehager or libraries. "Meaningful encounters between children and adults." |
| **Sisterhood** | 4 | ~45 | Weekly girls' groups over a school year for teenagers, focused on friendship, self-worth, body image, mental health. Youth programme. |
| **Dig In** | 4 | ~45 | "Smart mat for ungdom" — nutrition-and-cooking groups for young adults living alone (aleneboende ungdom). |
| **Ressursvenn** | 4 | ~45 | One-to-one volunteer mentor for women who have left an abusive relationship. Practical, social, labour-market-re-entry support. Core of the "voldsutsatte kvinner" line. |

Of 50 sampled chapters, **12 (24%) had empty activity sections** — similar rate to NF's 4/46 = 9% empty rate, but higher. N.K.S. has 550 chapters vs NF's ~108, so a long tail of very small rural chapters with no CMS-tagged activities is expected. Verification would require phone/email.

**Average activities per chapter (non-empty): 2.3** — thin compared with Red Cross's ~6–10 activities/chapter, roughly matching NF's shallow-taxonomy footprint.

## What's not on the chapter pages (but exists in the org)

Activities and services the org clearly runs but the lokalforening page template doesn't surface:

| Activity / service | Where it lives | Why it's not in the count |
|---|---|---|
| **Forskning / women's health research funding** | `/vart-arbeid`, [Stiftelsen Dam](https://dam.no) — N.K.S. is a dominant Dam member channel | National programme; no lokalforening-level volunteer role |
| **Kvinnehelsehus (4 hus, 2026)** | [sanitetskvinnene.no/kvinnehelsehus](https://sanitetskvinnene.no/kvinnehelsehus) — Oslo, Bergen, Drammen, Kristiansand | Institutional asset of a specific lokalforening; not a per-chapter activity tag |
| **Kvinnehelsealliansen** | National advocacy network | Policy / politisk arbeid, not volunteer-facing |
| **Stopp partnervold / Fredrikke-messaging** | [kvinnehelse](https://sanitetskvinnene.no/kvinnehelse) | Campaign layer, not chapter activity |
| **Sykehjem, pleiehjem, spesialistinstitusjoner** | Bergen (NKS Olaviken alderspsykiatri, NKS Fayehagen avlastning), Kristiansand (Kløvertun eldreomsorg, Kløvergården barnehage), Hamar (Hospice Sangen), etc. ([Wikipedia](https://no.wikipedia.org/wiki/Norske_Kvinners_Sanitetsforening); chapter own sites) | Operated by the lokalforening as owner, but surfaced on the chapter's **own** site, not the central page. The 10 chapters with registrert antallAnsatte > 0 in Brreg are the institution-operating chapters |
| **Barselkafé / barselgrupper** | Folded into Kvinnehelsehus activities in the 4 cities that have them | Not a per-chapter tag |
| **Sesamgruppa (integration)** | Kristiansand-specific program | Local innovation, not canonical |
| **Torvdagen, Påskemessa, basarer** | Per-chapter fundraising | Not volunteer-activity type; revenue |
| **Fredrikkeprisen / Fredrikke magazine** | National profile | Publication + award, not chapter activity |
| **WHAE (Ethiopia sister org)** | Central international work | No chapter-level pathway |

This is the first big structural finding: **N.K.S. uses NF's shallow-taxonomy model, not Red Cross's free-text model.** 7 canonical bins vs Red Cross's 25+. The chapter either has a tag or it doesn't; no per-chapter local naming is visible at the finder layer. However, unlike NF, N.K.S.'s 4 Kvinnehelsehus and ~30 lokalforening-owned health/care institutions are a **substantial parallel asset layer** that is effectively invisible in the chapter finder, and an important piece of any real portrait of what the org does locally.

## Thematic groupings

The 7 canonical activities plus the institutional layer map to six themes:

### Beredskap and community resilience
Omsorgsber. (Omsorgsberedskap)
→ Need signals: same as Red Cross Hjelpekorps / NF Førstehjelp og redningstjeneste — but narrower. N.K.S. Omsorgsberedskap is **evacuation-reception and care support**, not search-and-rescue; it complements the RC/NF rescue line rather than competing. Indicators: flom/skred/kvikkleire-soner, DSB sårbarhetskart, population ≥65 in flood-exposed grunnkretser.

### Women's health (N.K.S.-specific)
Kvinnehelsehus (institutional, 4 cities) · Ressursvenn · Stopp partnervold campaigns
→ Need signals: **new indicator requirements** — FHI kvinnehelseregister, Kripos voldsutsatte kvinner statistikk, krisesenter-statistikk (Bufdir), svangerskaps- og barseldekning per kommune, psykisk helse-tall SSB. None of these are in the RC or NF matrix.

### Integrering and migration
Språkvenn
→ Need signals: IMDi bosetting per kommune, SSB innvandrere kjønnsfordelt, UDI mottak-kart. Same indicator set as RC Norsktrening / NF Flyktning og inkludering, collapsed into one female-scoped bin.

### Loneliness, ageing and outdoor inclusion
Kløvertur · (institutional: eldreomsorg / sykehjem where chapters own them)
→ Need signals: SSB aleneboende 65+, FHI Folkehelseprofil ensomhet, terreng-tilgjengelighet. Parallel to RC Besøkstjeneste but physical/outdoors rather than 1-to-1 home visits.

### Children and youth
Lesevenn · Sisterhood · Dig In · (Kløvergården barnehage in Kristiansand)
→ Need signals: Ungdata (mental health, body image — Sisterhood is explicitly gender-coded), Bufdir barnefattigdom, SSB aleneboende ungdom, lese-ferdigheter per kommune. Sisterhood is the distinctly gendered youth line — no Red Cross or NF parallel.

### Forskning og politisk arbeid (national-only)
Forskningsmidler via Dam · Kvinnehelsealliansen · Fredrikke · Fredrikkeprisen
→ Not indicator-driven in the kommune-need sense. Mission layer: similar to NF's Internasjonale spørsmål in that it has no local-need correlate, but different in content (research funding vs political solidarity).

## Local naming patterns

Unlike Red Cross but like Norsk Folkehjelp, N.K.S. uses a uniform slug + display-name convention:

- **Slug convention**: `sanitetskvinnene.no/lokalforening/{slug}` where slug is `{stedsnavn}-sanitetsforening` or `{stedsnavn}-sanitetslag`, kebab-cased, diacritics transliterated (`floro-`, `tromsoe-`, `oksnes-`, `aaa-`). Examples: `aalesund-sanitetsforening`, `floro-sanitetsforening`, `orland-sanitetslag`.
- **URL variant**: About 1 in 8 sampled slugs use the bare `/{slug}` pattern without `/lokalforening/` prefix (e.g. `/bjollanes-sanitetsforening`, `/biristrand-sanitetsforening`, `/liadal-sanitetsforening`). Likely a legacy redirect / CMS-variant. Both forms resolve.
- **Display name**: always "{Stedsnavn} sanitetsforening" or "{Stedsnavn} sanitetslag" (the two terms are historically interchangeable; `sanitetslag` dominates in Vestland/Sogn). Youth branches are "{Sted} unge sanitetsforening" (e.g. Levanger unge).
- **Legal-entity name in Brreg**: UPPERCASE, e.g. `ÅLESUND SANITETSFORENING`, `AURLAND SANITETSLAG`.
- **No Oslo-style in-city fragmentation layer**: Oslo has ~5–6 sub-chapters (Oslo, Blindern og Vinderen, Bygdøy, Grefsen Kjelsås og omegn, Gamle Oslo, Groruddalen, Snarøya). Fewer than NF's 8 Oslo lokallag, much fewer than Red Cross's denser Oslo structure.
- **Two chapters founded post-2020**: GRORUDDALEN (2020-01-30) and KOLSET (2021-09-06) — modest re-growth after the steady 2010s consolidation. One Oslo chapter re-registered 2026-03-12 (TØNSBERG SANITETSFORENING — likely a re-filing of a long-existing forening rather than a new founding).

Implication for a framework port: N.K.S.'s `{stedsnavn}-{type}` pattern is trivially crawlable. The CMS-fixed 7-activity taxonomy means activity-indicator matching is as simple as NF's (6-bin NF × 7-bin N.K.S.). Institution ownership (Kvinnehelsehus + 10 employee-bearing chapters) is a **new axis** not present in Red Cross or NF, and is the single most important structural extension to the framework.

## Brreg chapter-level org.nr findings

Query: `https://data.brreg.no/enhetsregisteret/api/enheter?navn=sanitetsforening&organisasjonsform=FLI&size=600` (and `navn=sanitetslag` equivalent).

| Metric | Sanitetsforening (FLI) | Sanitetslag (FLI) | Combined |
|---|---:|---:|---:|
| Total entities in Brreg | 525 | 55 | **580** |
| Registered in Frivillighetsregisteret | 470 (89.5%) | 51 (92.7%) | **521 (89.8%)** |
| With `antallAnsatte > 0` | 10 | 0 | **10** |
| Sum of `antallAnsatte` (chapter level, excludes 51 at HQ) | 171 | 0 | **171** |
| Oldest stiftelsesdato | 1896-02-26 (Oslo sanf. + Rogaland fylke + Hovedforeningen share date) | 1899-01-06 | 1896-02-26 |
| Newest stiftelsesdato | 2026-03-12 (Tønsberg, likely re-reg) | 2013-04-10 | 2026-03-12 |

### Employee-bearing chapters (the 10 with registered ansatte)

| Chapter | Employees | Orgnr | What they operate (based on chapter sites + Wikipedia) |
|---|---:|---|---|
| BERGEN SANITETSFORENING | 91 | 944888799 | NKS Olaviken alderspsykiatri + sykehjemsavd. Huntington; NKS Fayehagen avlastningsbolig; Kvinnehelsehus Bergen |
| STAVANGER SANITETSFORENING | 15 | 971080426 | Kvinnehelse-programs (no Kvinnehelsehus yet) |
| MANDAL SANITETSFORENING | 11 | 971431296 | Institution portfolio unconfirmed from central site |
| MO SANITETSFORENING | 11 | 941380034 | Institution portfolio unconfirmed |
| OSLO SANITETSFORENING | 11 | 938726582 | Kvinnehelsehus Oslo |
| KRISTIANSAND SANITETSFORENING | 9 | 971550937 | Kløvergården barnehage; Kløvertun eldreomsorg + varmtvannsbasseng; Kvinnehelsehus Kristiansand |
| OS SANITETSFORENING | 9 | 838971652 | Institution portfolio unconfirmed (Os i Vestland) |
| LØRENSKOG SANITETSFORENING | 8 | 920756492 | Institution portfolio unconfirmed |
| SNÅSA SANITETSFORENING | 6 | 985568731 | Institution portfolio unconfirmed |
| DRAMMEN SANITETSFORENING | 6+ | 875576542 | Kvinnehelsehus Drammen |

**Reading**: the **~30 health/care institutions owned by lokalforeninger** that `ngo-landscape.md` cites are not matched 1:1 by the 10 Brreg employee-bearing chapters. Two reasons:

1. Many institutions are separate legal entities (stiftelser, AS, or separate FLI) — e.g. NKS Olaviken likely has its own org.nr subordinate to Bergen sanitetsforening's.
2. Several lokalforeninger own buildings/eiendom and lease them out (Hospice Sangen at Hamar, for instance, is housed by the chapter but operated by a third party), so the chapter itself has no employees.

A full institution census would need a `navn=nks*` + `navn=kløver*` + `navn=kvinnehelsehus*` Brreg pass, plus a link-out check from each chapter's own website. That's a follow-up.

**Compared with NF**: N.K.S.'s 89.5% Frivillighetsregisteret-registration rate is statistically identical to NF's 88%. Both orgs have effectively all chapters registered at chapter-entity level, so **Grasrotandelen and Lottstift joins work per-chapter** for N.K.S. as they do for NF. The big difference is that N.K.S. chapters are ~5× more numerous than NF's (580 vs 121) and a sharply non-uniform 10 of them run real staffed institutions.

## Comparison to Red Cross and Norsk Folkehjelp

### Shared activities (three-way overlap)

| Red Cross | Norsk Folkehjelp | Sanitetskvinnene | Notes |
|---|---|---|---|
| Hjelpekorps (285) + Beredskapsvakt (156) | Førstehjelp og redningstjeneste (~80) | Omsorgsber. (~360) | **Same beredskap frame, different operational scope.** RC + NF run rescue + first-aid-at-event; N.K.S. runs *reception/care-during-crisis* — evacuation centres, warm drinks, logistics for evacuees. Not a rescue capability, a care capability. |
| Norsktrening (69) + Flyktningguide (60) | Flyktning og inkludering (~44) | Språkvenn (~155) | All three run language-practice programs for migrants. N.K.S.'s Språkvenn is gender-scoped (minority women). Biggest **female-specific integration footprint** in Norwegian civil society. |
| Besøkstjeneste (232) + Besøksvenn med hund (127) + Kulturvenn | — | Kløvertur (~275) | Physical/outdoor analogue of RC's visiting programmes. Different operationalisation — group-activity rather than 1-to-1 home visit. |
| BARK (62) + Leksehjelp (66) | — | Lesevenn (~55) | Both reading-adjacent child-inclusion programs. |
| Ung + RØFF (178) | Sanitetsungdom (~49) + Solidaritetsungdom (~18) | Sisterhood (~45) · (unge sanitetsforening chapters: ~10 nationally) | **All three have a youth wing. Only N.K.S. runs an explicitly gendered youth line (Sisterhood for girls).** |

### N.K.S.-unique activities (no RC or NF parallel)

| N.K.S. activity / capability | What it is | Why RC and NF don't have it |
|---|---|---|
| **Sisterhood** | Weekly girls' groups over a school year, 13–18, focused on mental health, friendship, body image. ~4/50 in sample, ~45 projected. | RC's youth work (RØFF, Ung, Kors på halsen) is gender-mixed; NF's (Sanitetsungdom, Solidaritetsungdom) is mixed. Sisterhood is the only chapter-delivered girls-only weekly programme in the comparison set. |
| **Ressursvenn** | Volunteer mentor for women who have left an abusive relationship. ~4/50, ~45 projected. | RC and NF do not run a named post-violence mentorship line. RC has Vitnestøtte (trial-support, adjacent but not the same); RC's crisis-senter work is activity *for children at* the senter, not adult re-entry support. |
| **Dig In** | Smart-nutrition cooking groups for young adults living alone. ~4/50, ~45 projected. | No direct RC or NF counterpart. Closest RC equivalent is BARK or Fellesverket drop-in cafés; NF has no nutrition programme. |
| **Kvinnehelsehus** (4 operating — Oslo, Bergen, Drammen, Kristiansand) | Low-threshold drop-in women's health centres owned and operated by the lokalforening; free health-adjacent activities, not clinical. | RC and NF have no parallel institutional asset. Closest analogy is RC Fellesverket youth drop-ins (similar model, different target group). |
| **Lokalforening-owned institutions** (sykehjem, alderspsykiatri, avlastningsbolig, barnehage, hospice, eldreboliger) | Estimated ~30 institutions owned by ~10 employee-bearing lokalforeninger. Brreg confirms 171 ansatte across 10 chapters. | RC and NF are pure volunteer federations at chapter level. No chapter of either owns a sykehjem. This is a **structural asset class unique to N.K.S.** in the Tier-A chapter-federation set. |
| **Forskningsfinansiering via Dam** | N.K.S. is a dominant Dam-member research funder for women's health. | RC and NF have research engagement but not as a core identity activity. |

### Framework-fit assessment

N.K.S. is Tier-A in `ngo-landscape.md` (550 chapters, each own org.nr, strong indicator alignment on women's health + omsorg + beredskap). Three specific framework deltas relative to the RC + NF template:

1. **Shallow activity taxonomy, like NF.** 7 canonical bins vs Red Cross's 25+ free-text activities. The chapter-finder activity filter stays simple (7 checkboxes). Extraction from the page is a fixed CSS selector. Matches the NF pattern — NF lesson re-used cleanly.
2. **Institution layer is a new framework dimension.** 4 Kvinnehelsehus + ~30 chapter-owned institutions are high-value public-facing assets that need their own entity type in the data model. Neither RC nor NF has anything like this at chapter level. Recommendation: add an `institutions` array to the chapter record with fields `{name, type: sykehjem|barnehage|kvinnehelsehus|avlastning|hospice|eldreboliger, address, operating_entity_orgnr, employees_brreg}`. This lets the UI show "Dette er også drevet lokalt" alongside volunteer activities. It's also a piece that service clubs and patient orgs don't have, so it's **real framework extension, not just cosmetic**.
3. **Gendered need-indicator column is required.** Existing RC + NF matrix uses gender-blind FHI folkehelseprofil signals. N.K.S.'s core mission — kvinnehelse — demands kvinne-scoped columns. See next section.

Net: **~65% of the Red Cross framework maps across directly (finder, chapter page, pathways, Brreg/Lottstift/Grasrotandelen backbone).** ~10% needs extension (institutions entity type). ~25% is new (kvinnehelse indicator columns). Lower reuse rate than NF's 75% — because N.K.S. has two structural differences from RC (institutions + gendered indicators) where NF had one (political-campaign pathway).

### New indicator columns N.K.S. introduces

These are **not in the RC or NF matrix** and are the interesting framework-extension signals for N.K.S.:

| Indicator | Source | Which N.K.S. activity it supports |
|---|---|---|
| Kvinnehelseregister-data (FHI) | [FHI kvinnehelse](https://www.fhi.no/) | Kvinnehelsehus, Ressursvenn siting |
| Medisinsk fødselsregister / Svangerskapsregister (FHI) | FHI | Kvinnehelsehus barselkafé programming |
| Krisesenterstatistikk (Bufdir) | [Bufdir krisesenter](https://bufdir.no/statistikk-og-analyse/krisesentertilbudet) | Ressursvenn footprint need |
| Kripos voldsutsatte kvinner | Kripos årsrapport | Ressursvenn need |
| Psykisk helse kvinner 16–24 år (Ungdata) | [Ungdata](https://www.ungdata.no/) | Sisterhood need (gender-scoped) |
| Ensomhet kvinner 65+ (FHI Folkehelseprofil, kjønnsfordelt) | FHI | Kløvertur for elderly women |
| Innvandrerkvinner per kommune, kjønnsfordelt (SSB) | [SSB innvandrere](https://www.ssb.no/befolkning/innvandrere) | Språkvenn footprint |
| Sykehjems- og barnehage-dekning per kommune (KOSTRA) | SSB KOSTRA | Institution-gap analysis for chapters that own sykehjem/barnehage |
| Aleneboende ungdom 18–29 per kommune (SSB) | SSB | Dig In need |

**Architecture implication**: the existing RC + NF indicator matrix is gender-blind. A multi-org framework that includes N.K.S. must either (a) carry kjønnsfordelt versions of existing indicator columns where they exist, or (b) let the N.K.S. view swap in kvinne-scoped variants on the same canonical indicators. Option (b) is cleaner — the canonical indicator is "ensomhet 65+", and the N.K.S. view renders the `kvinner` slice of that same FHI dataset.

## Open question / missing data

- **Institution census is incomplete.** `ngo-landscape.md` cites "~30 health/care institutions owned by lokalforeninger"; Brreg shows 10 employee-bearing sanitetsforening FLIs with 171 ansatte total. The delta is institutions held as stiftelser, AS, or nested FLIs sibling to the lokalforening. Unblock requires: Brreg queries for `navn=nks*`, `navn=kløver*`, `navn=olaviken`, `navn=fayehagen`, `navn=hospice sangen`, plus cross-referencing each chapter's own website for a "våre institusjoner" section. Worth a full follow-up pass.
- **12 of 50 sampled chapter pages had empty activity sections.** Same signal as NF's empty sections: CMS gap, real inactivity, or in-transition chapter. Verification needs email/phone. At 24% empty rate across 50 chapters, linearly extrapolated ~130 of 550 chapters are effectively silent — a much bigger long-tail than NF's ~9%.
- **Chapter founding year is not on the chapter page** — only in Brreg `stiftelsesdato`. Brreg's dates show a long 1896–1920s founding wave, a 1960s refounding wave, and modest post-2015 growth (6 chapters founded since 2017). The chapter page should surface founding year from Brreg if possible.
- **Member count per chapter** is not exposed. N.K.S. reports 45 000+ members centrally; at 550 chapters that's ~82 members/chapter on average, but variance is almost certainly 5×–10× given the city/rural split.
- **Kvinnehelsehus is the next wave.** Only 4 operate (Oslo, Bergen, Drammen, Kristiansand) in 2026. Central strategy implies expansion; a live page should watch for new kvinnehelsehus openings and flag the 6–10 largest non-Kvinnehelsehus lokalforeninger (Trondheim, Stavanger, Ålesund, Tromsø, Fredrikstad, Lørenskog, Sarpsborg, Levanger, Lillehammer) as likely next hosts.
- **Youth-chapter structure (unge sanitetsforening).** At least two surfaced (Levanger unge, Bjerkvik appears to run "De Unges Sanitetsforening Bjerkvik" as a sub-group). The population of youth chapters and their legal relationship to parent geographic chapters is not quantified here — `navn=unge sanitet` Brreg returns 595 hits which includes all parent sanitetsforening names, so needs tighter filter.
- **Sanitetslag vs sanitetsforening** is a naming-dialect difference (sanitetslag in Vestland/Sogn; sanitetsforening elsewhere), legally identical. The finder treats them uniformly.

## References

- [Sanitetskvinnene lokalforening-finder](https://sanitetskvinnene.no/lokalforening) — 55-page paginated chapter index (fetched 2026-04-18)
- [Sanitetskvinnene vårt arbeid](https://sanitetskvinnene.no/vart-arbeid) — national work areas
- [Sanitetskvinnene bli frivillig](https://sanitetskvinnene.no/bli-frivillig-i-sanitetskvinnene) — volunteer-activity framing
- [Sanitetskvinnene kvinnehelsehus](https://sanitetskvinnene.no/kvinnehelsehus) — the 4 Kvinnehelsehus
- [Sanitetskvinnene kvinnehelse](https://sanitetskvinnene.no/kvinnehelse) — Ressursvenn, Stopp partnervold, forskning
- Individual chapter pages under `https://sanitetskvinnene.no/lokalforening/{slug}` — 50 sampled, 38 parsed
- [Bergen sanitetsforening — om oss](https://bergensanitetsforening.no/om-oss/) — NKS Olaviken, NKS Fayehagen, Kvinnehelsehus Bergen
- [Kristiansand sanitetsforening — om oss](https://kristiansandsanitetsforening.no/om-oss) — Kløvertun, Kløvergården barnehage, Kvinnehelsehus Kristiansand
- [Brreg Enhetsregisteret, navn=sanitetsforening, organisasjonsform=FLI](https://data.brreg.no/enhetsregisteret/api/enheter?navn=sanitetsforening&organisasjonsform=FLI&size=600) — 525 entities, 470 in Frivillighetsregisteret, 10 with ansatte
- [Brreg Enhetsregisteret, navn=sanitetslag, organisasjonsform=FLI](https://data.brreg.no/enhetsregisteret/api/enheter?navn=sanitetslag&organisasjonsform=FLI&size=100) — 55 entities, 51 in Frivillighetsregisteret
- [Norske Kvinners Sanitetsforening — Wikipedia](https://no.wikipedia.org/wiki/Norske_Kvinners_Sanitetsforening) — institutional history, research, WHAE
- [Red Cross activities](./redcross-activities.md) — reference template
- [Norsk Folkehjelp activities](./norskfolkehjelp-activities.md) — peer-org precedent this file mirrors structurally
- [ngo-landscape.md](./ngo-landscape.md) — size/structure context (550 lokalforeninger, 45k members, 130m NOK central, ~30 health/care institutions)
