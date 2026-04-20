# Norsk Folkehjelp activities

The canonical activities offered by Norsk Folkehjelp's lokallag, derived from a sample scrape of the public chapter pages under `https://folkehjelp.no/lokallag/{slug}` on 2026-04-18.

## Source and method

- **Source**: `https://folkehjelp.no/lokallag` (chapter index, 108 local chapters) and individual chapter pages `https://folkehjelp.no/lokallag/{slug}`.
- **Scale**: 108 lokallag listed across 14 fylker. NF's own figure is "godt over 100 lokallag" and ~16 000 members; Resultatrapport 2024 gives ~2 000 aktive frivillige and 1.8 bn NOK income (see `ngo-landscape.md`).
- **Sample**: 46 chapter pages fetched (WebFetch); 42 parsed cleanly. The remaining 4 returned a banner-only "Aktivitetsområder" section without listed items (Alta, Hammerfest, Oppdal, Sarpsborg og Omegn, Sentralt) — either the chapter has not populated the page or the section renders empty in the Craft CMS when no activities are tagged. These are excluded from the count.
- **Note on derivation**: Unlike Red Cross (whose per-chapter activity names are locally varied), NF uses a **small fixed vocabulary** of 5–6 standard "aktivitetsområder" rendered from the CMS. Every chapter page pulls from the same canonical set, so the counts below are chapter-level footprint, not an activity-name pattern match. This is a much cleaner taxonomy than Red Cross's 2 407 local-naming variants, but it is also coarser: sub-activities (e.g. språkkafé, redningsgruppe, kvinnefellesskap) are not exposed on the lokallag page — they live inside the area description or on separate "minisites" (the sitemap lists a `minisites` section).
- **Caveats**: The chapter's own activity page text often reads as CMS boilerplate ("Som frivillig innen X er du en viktig del av..."), so "presence" means the area is tagged on the chapter page, not that the chapter is actually running that activity this month. The Sanitet-sub-labelled entities (e.g. `sanitet-haukeland`) and Solidaritetsungdom-labelled entities (e.g. `solidaritetsungdom-bergen`) are separate lokallag that appear alongside the main geographic chapters. Extrapolation from sample of 46 to population of 108 is done linearly and flagged.

## Activities, by chapter footprint

Ordered by how many sampled chapters tag each canonical area. Counts are from the 42-chapter usable sample; the "Extrapolated to ~108" column scales linearly.

| Activity area | In sample (n=42) | Extrapolated to 108 | What it is |
|---|---:|---:|---|
| **Førstehjelp og redningstjeneste** | 31 | ~80 | Volunteer first-aid and search-and-rescue corps — the Sanitetsgruppe / Sanitet + redningstjeneste line. NF has ~70 rescue groups and ~2 000 rescue-qualified frivillige nationally. Primary beredskap capability. Covers terrain rescue, event first-aid, beredskapsvakt. |
| **Sanitetsungdom** | 19 | ~49 | Youth first-aid wing, ages 13–18. Outdoor skills, first aid, entry path into the rescue corps. Analogous to Red Cross RØFF. |
| **Samfunnsarbeid** | 20 | ~51 | Community work — the NF-specific umbrella for "creating møteplasser and tjenester for — and with — different groups in your local community." Catches women's networks, diaspora networks, drop-in cafés, integration activities that don't fit the refugee or rescue boxes. |
| **Flyktning og inkludering** | 17 | ~44 | Refugee and inclusion work. Language cafés (språkkafé), leisure activities (fritidsaktiviteter), reception-centre engagement. NF's main migration domestic line. |
| **Internasjonale spørsmål** | 12 | ~31 | International solidarity engagement — speaker meetings, reisestøtte for project trips to NF partner countries. Feeds into NF's 35-country development co-op portfolio. No direct Red Cross parallel. |
| **Solidaritetsungdom** | 7 | ~18 | Political/solidarity youth movement, ages 13–30. Anti-racism, refugee policy, international solidarity, nuclear disarmament (ICAN co-laureate lineage). Distinct from Sanitetsungdom: political, not operational. No Red Cross equivalent. |

Of 46 sampled chapters, 4 had empty activity sections (Alta, Hammerfest, Oppdal, Sarpsborg og Omegn, plus "Sentralt" which is an umbrella entity). A real chapter-footprint view needs those 4 confirmed by phone/email.

## What's not on the chapter pages (but exists in the org)

Activities that NF clearly runs but that the lokallag page template doesn't surface as top-level areas:

| Activity | Where it lives | Why it's not in the count |
|---|---|---|
| **Minerydding / humanitarian disarmament** | `folkehjelp.no/vart-arbeid` — 2m+ landmines cleared across 40+ countries since 1992 | National programme; no lokallag-level volunteer pathway |
| **Norsktrening** | Folded into *Flyktning og inkludering* as "språkkaféer" | Implicit sub-activity, not separately tagged |
| **Leksehjelp** | Folded into *Flyktning og inkludering* or *Samfunnsarbeid* as "fritidsaktiviteter" | Some chapters run it, but not surfaced on chapter page |
| **Kvinnefellesskap / kvinnenettverk** | Folded into *Samfunnsarbeid* | Exists as per-project activity, not a canonical area |
| **Eksilnettverk** | Folded into *Samfunnsarbeid* / *Internasjonale spørsmål* | Diaspora/exile networks — surface as events, not areas |
| **Unge frivillige / student groups** | Own lokallag (Studentgruppe Gjøvik, Blindern, Bislett etc.) | University-anchored chapters, each with its own activity mix |
| **Asylmottak work** | Folded into *Flyktning og inkludering* | NF has run reception centres operationally; volunteer-facing text groups it under inkludering |
| **Førstehjelpskurs / kursholder** | Folded into *Førstehjelp og redningstjeneste* | No separate "kursholder" tag as Red Cross has |

This is the first big structural finding: **NF's chapter-page taxonomy is shallower than Red Cross's.** Red Cross exposes 25+ named activities per chapter (Hjelpekorps, Besøkstjeneste, Flyktningguide, Norsktrening, Leksehjelp, BARK, Ferie for alle, Gatemegling etc.) — NF compresses the equivalent set into 6 bins. To get activity-level granularity in an NF framework port, we'd need either (a) the CMS data behind the chapter pages, (b) the `minisites` + `localBranchEvents` sitemap entries, or (c) direct chapter outreach.

## Thematic groupings

The six canonical areas map to four humanitarian-indicator themes, with a fifth that is NF-specific:

### Beredskap and rescue
Førstehjelp og redningstjeneste · Sanitetsungdom
→ Need signals: same as Red Cross Hjelpekorps — terrain exposure, skred/flom/kvikkleire-soner, event density, distance to akuttmottak. NF and Red Cross are direct peers and historically sometimes overlap on the same terrain.

### Refugees and integration
Flyktning og inkludering · Samfunnsarbeid (partially)
→ Need signals: IMDi bosetting, UDI asylmottak-kart, norskprøve-resultater, kommune-level flyktningetjeneste-dekning. Same indicator set as Red Cross Migrasjon/Flyktningguide/Norsktrening, collapsed into one bin.

### Youth engagement
Sanitetsungdom · Solidaritetsungdom
→ Need signals: Ungdata (trivsel, ensomhet, politisk engasjement), Bufdir barnefattigdom, age-demography per kommune. Sanitetsungdom parallels RØFF; Solidaritetsungdom is unique to NF and tracks an explicitly political frame (anti-racism, int'l solidarity).

### Community work / social infrastructure
Samfunnsarbeid
→ Need signals: NAV levekårstall, SSB single-parent households, integration indicators. The softest bin; catches activities that don't fit elsewhere.

### NF-specific: International solidarity and labour-movement politics
Internasjonale spørsmål · Solidaritetsungdom · (national-only: minerydding, utviklingssamarbeid)
→ Need signals: not indicator-driven in the domestic-need sense. These activities are **mission-driven** (fagbevegelsen-aligned, Norad-funded, anti-war). The framework's crisis-band and need-indicator matrix is a poor fit here. A port would need a separate "campaign / solidarity action" pathway — closer to what Amnesty and Natur og Ungdom need.

## Local naming patterns

NF lokallag URL and naming is much more uniform than Red Cross's:

- **Slug convention**: `folkehjelp.no/lokallag/{slug}` where slug is kommune or region name, kebab-cased, diacritics transliterated (`aa` for å, `oe` for ø/æ). Examples: `asker-og-baerum`, `loerenskog`, `soer-varanger`, `aalesund-og-omegn`.
- **Display name**: always "Norsk Folkehjelp {Sted}" — e.g. "Norsk Folkehjelp Arendal", "Norsk Folkehjelp Asker og Bærum".
- **Non-geographic lokallag**: Solidaritetsungdom branches are slugged `solidaritetsungdom-{by}` (Kristiansand, Arendal, Bodø, Kristiania, Sentralt, Ullandhaug, Bergen, Tromsø, Nidaros). Sanitet-specific lokallag: `sanitet-haukeland` (hospital-anchored). Student-anchored: `studentgruppe-gjoevik`, `blindern`, `bislett`, `kristiania`. Geographic-unusual: `svalbard`, `sentralt`.
- **Oslo structure**: Oslo has 8 lokallag — Oslo (main), Blindern, Bislett, Kristiania, Sentralt, Løren og omegn, Solidaritetsungdom Kristiania, Solidaritetsungdom Sentralt. This is a denser student-and-ungdom pattern than Red Cross uses in Oslo.
- **Fylke grouping on the index page**: 14 regions: Agder, Akershus, Buskerud, Finnmark, Innlandet, Møre og Romsdal, Nordland, Oslo, Rogaland, Telemark, Troms, Trøndelag, Vestfold, Vestland, Østfold. Index page is `folkehjelp.no/lokallag` — a server-rendered HTML list grouped by fylke, no API.

Implication for a framework port: NF's `{geo-slug} → chapter page` pattern is clean to crawl. Activity-area extraction is a simple CSS selector on the "Aktivitetsområder" section (fixed Craft CMS template). The shallow taxonomy means the activity-indicator matrix has 6 rows instead of 25+ — faster to build, less discriminating between chapters.

## Comparison to Red Cross

### Shared activities (structural peers)

| Red Cross | Norsk Folkehjelp | Notes |
|---|---|---|
| Hjelpekorps (285) | Førstehjelp og redningstjeneste (~80) | Both are volunteer search-and-rescue + first-aid corps. NF is ~1/4 Red Cross's rescue footprint but institutionally equivalent; both sit under *Frivillige organisasjoners redningsfaglige forum* (FORF). Direct peers on the same terrain. |
| Beredskapsvakt | Førstehjelp og redningstjeneste (sub) | NF folds event-beredskap into the rescue area rather than naming it separately. |
| RØFF + Ung (178) | Sanitetsungdom (~49) | Youth first-aid wing, age 13–18, entry path to rescue. Direct functional peer. |
| Migrasjon / Flerkultur (119) + Flyktningguide (60) + Norsktrening (69) | Flyktning og inkludering (~44) | Red Cross splits refugee work into three named activities; NF collapses them into one. Total footprint is probably similar (RC has ~170 chapter-entries across the three; NF ~44 chapters listing one bin). |
| Kursholder (90) | Førstehjelp og redningstjeneste (sub) | NF doesn't split out instructor-certification as its own area. |

### NF-unique activities (no Red Cross parallel)

| Norsk Folkehjelp | What it is | Why Red Cross doesn't have it |
|---|---|---|
| **Solidaritetsungdom** | Political youth wing, anti-racism + int'l solidarity + disarmament. ~7/42 chapters, ~18 projected. | Red Cross is politically neutral by the Fundamental Principles; NF is explicitly aligned with the labour movement (*fagbevegelsens humanitære organisasjon*) and runs political youth work. |
| **Internasjonale spørsmål** | Local speaker meetings + applications for project-travel to NF partner countries. ~12/42 chapters, ~31 projected. | Red Cross international delegate work is centralised through the ICRC/IFRC pipeline; there is no chapter-level "internasjonale spørsmål" activity in the sense NF has. |
| **Minerydding / humanitarian disarmament** | 2m+ mines cleared across 40+ countries since 1992. National, not chapter-level. | Red Cross has no mine-action programme; this is NF's distinctive international line. |
| **Samfunnsarbeid (open umbrella)** | Catch-all for women's networks, diaspora groups, drop-in cafés, integration experiments. | Red Cross's Treffpunkt/Fellesverket/BARK/Gatemegling etc. are each named and defined — NF uses one umbrella term for the same space. |

### Framework-fit assessment

NF is Tier-A in `ngo-landscape.md` (drop-in fit) but with three structural differences from Red Cross that any port must handle:

1. **Shallow activity taxonomy.** 6 canonical bins vs Red Cross's 25+ named activities. The activity filter on the chapter finder is simpler (6 checkboxes vs 25) but much less discriminating. A chapter listing "Samfunnsarbeid" tells you almost nothing about what's actually happening there. **Mitigation**: surface the chapter's events (`localBranchEvents` in sitemap) as the real signal of what the chapter does week-to-week, instead of the area tags.
2. **Political youth line.** Solidaritetsungdom requires a "campaign / political action" engagement pathway that Red Cross's pathway model (Gi tid / Gi penger / Bli medlem) doesn't have. Natur og Ungdom and Amnesty have the same requirement — this is a fourth pathway, not an NF-specific quirk.
3. **International solidarity activities with no indicator-matrix correlate.** *Internasjonale spørsmål* and the mine-action line don't map to Norwegian domestic need indicators. The indicator matrix either drops these rows or adds international-context signals (OCHA appeals, Norad-priority countries, NATO-conflict zones) — out of scope for a domestic chapter-finder.

Net: a multi-NGO framework reuses the finder, map, chapter-page scaffold, and the beredskap + migrasjon + ungdom indicator columns directly for NF. It needs to add a fourth pathway (campaign action) and either hide or footnote the indicator matrix for NF-unique areas. **~75% of the Red Cross framework maps across to NF directly — marginally higher than the 70% sector-average estimate in `ngo-landscape.md` because both orgs sit in the same humanitarian-beredskap-migration triangle.**

## Open question / missing data

- **Chapter count: website lists 108, Brreg has 121 active geographic lokallag** under the pattern `NORSK FOLKEHJELP {name}` (FLI form). Gap of ~13 is likely dormant-but-still-registered or very-recently-founded (one registered 2024-11-07) not yet on the website. Oldest active is Bodø (stiftet 1940-02-22), newest is 2024-11-07.
- **4 of 46 sampled chapter pages returned empty activity sections.** Unclear whether this is a CMS gap, a real "no activities" signal, or a chapter-in-transition. Primary verification needs chapter email/phone.
- **Sub-activity granularity is lost.** Whether a given chapter runs språkkafé, leksehjelp, kvinnefellesskap, or exile network under the "Flyktning og inkludering" umbrella is not visible from the lokallag page. The `localBranchEvents` sitemap and `minisites` section are the next places to look — not scraped in this pass.
- **Member counts per chapter** are not on the lokallag page. NF reports ~16 000 members nationally but does not expose per-chapter numbers publicly.
- **Chapter-level org numbers — resolved 2026-04-19.** Brreg query for `organisasjonsform=FLI&navn=norsk+folkehjelp` returns **121 geographic lokallag, each with its own org.nr**. **107 of 121 (88%) are registered in Frivillighetsregisteret** — so Grasrotandelen works at chapter level, and per-chapter Lottstift joins work where chapters receive state funding. Only 2 of 121 lokallag have registered employees (consistent with all-volunteer chapter model). The `ngo-landscape.md` caveat about NF lokallag "often not filing separately" turns out to be wrong for NF specifically — it's more accurate to say most have own org.nr but few have accounts above filing threshold (Regnskapsregisteret coverage is thin because chapters are small). A further 7 youth-specific entities (Sanitetsungdom, Solidaritetsungdom lokallag) also carry their own org.nr.
- **The relationship between Solidaritetsungdom chapters and geographic chapters.** Some cities have both (Kristiania + Solidaritetsungdom Kristiania). Are Solidaritetsungdom chapters legally separate? Is the relationship "wing" or "sister"? Needs verification from NF vedtekter.

## References

- [NF lokallag index](https://folkehjelp.no/lokallag) — the chapter list used here (fetched 2026-04-18).
- [NF bli-frivillig](https://folkehjelp.no/bli-frivillig) — canonical volunteer-activity framing.
- [NF vårt arbeid](https://folkehjelp.no/vart-arbeid) — national work areas including minerydding, utviklingssamarbeid.
- Individual chapter pages under `https://folkehjelp.no/lokallag/{slug}` — 46 sampled, 42 parsed.
- [NF Resultatrapport 2024](https://app.innsamlingskontrollen.no/storage/document/arsberetning-norsk-folkehjelp-2024.pdf) — sized figures (1.8 bn NOK income, ~2 000 aktive frivillige, ~16 000 members, ~100 lokallag) — from `ngo-landscape.md`.
- [Red Cross activities](./redcross-activities.md) — the template this file mirrors.
