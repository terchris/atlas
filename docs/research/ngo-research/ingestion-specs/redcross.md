# Ingestion spec — Røde Kors (Norges Røde Kors)

**Status · proven 2026-10-04 (task R8).** Owner decision 2026-10-04: Røde Kors is scraped like
every other NGO; its API is not used at this stage, so no organisation gets an advantage through a
privileged channel. NGO orgnr 864139442.

Røde Kors is **federated**: each branch (*lokalforening*) is its own legal entity, under one of 17
districts. It is the only NGO whose branch pages describe each activity **in the branch's own
words**, with schedule, place and coordinator. Elsewhere one national text covers every chapter.

## Sources and discovery

| | |
|---|---|
| Base | `https://www.rodekors.no` |
| Index | `https://www.rodekors.no/sitemap.no.xml/` — 1 588 URLs under `/lokalforeninger/` (2026-10-04) |
| Districts | depth one: `/lokalforeninger/<district>/` — 19 URLs; 18 are district pages (one, `dk-abo`, is the Akershus/Buskerud/Østfold district office) |
| Branches | depth two: `/lokalforeninger/<district>/<branch>/` — 382 URLs, of which 339 are branches |
| Not branches | depth-two section pages of a district (`om`, `om-oss`, `kontakt`, `aktiviteter`, `bli-frivillig` …); deeper pages are news, about pages and free-form activity sections |
| Registry side | Brreg `enheter` whose folded name contains `RODE KORS` — `brreg-chapter-matching.md` |

**The sitemap lists some URLs twice** (`buskerud/drammen`, `akershus/fet`, `trondelag/levanger`, the
`trondelag` district). De-duplicate before fetching, or reconciliation leaves the second copy as a
false page-only chapter.

## Politeness

- `robots.txt` (2026-10-04): only a `Sitemap:` line — no disallow, no Crawl-delay.
- 1 request per second; ~360 pages, ~7 minutes. User-Agent with the contact address.

## What to read → Atlas columns

A district or branch page (`reference-code/src/sources/redcross-branches.ts`, Cheerio):

| Source | Rule | Atlas column |
|---|---|---|
| `main h1.page__title` | as published ("Bergen Røde Kors", "Olden Raude Kross") | `dim_chapter.name` |
| link text `Tilbake til: <district>` | the parent as the site states it | parent (`parent_method = sitemap_path`) |
| `dl dt` "Adresse" → next `dd` | `<street>, <postcode> <PLACE>`; `-` = none | `dim_chapter.address` (visiting) |
| `dl dt` "Telefon" / "E-post" → `dd` | `-` = none (phone is published by only 5 branches) | `dim_chapter.phone`, `email` |
| each `.expander__item` | one activity: `button.expander__head span` = the branch's local name; `.expander__body` = its text, verbatim (`lib/description.ts`) | `fact_chapter_activities.local_activity_name`, `.description` |
| `.expander__outer h2.expander__title` before the item | the branch's category heading — mostly generic ("Våre aktiviteter"); **not stored** | — |

**A page is a branch when it has a title and the address block.** A district's own section pages
have the address block too ("Om Agder Røde Kors", "Kontakt Røde Kors i Trøndelag"); exclude their
slugs (`om`, `om-oss`, `kontakt`, `kontakt-oss`, `aktiviteter`, `bli-frivillig` …).

## Rules and traps

1. **Page furniture is not the branch's:** the *Bli frivillig*, *Bli medlem* and *grasrotandel*
   buttons (`a.cta-button`) and the feedback form appear on every page. Read only `h1`, the `dl` and
   the expanders.
2. **Not every expander is an activity.** 55 items (2026-10-04) are about the branch itself: board,
   annual meeting, staff, renting out the house or cabin, "Om …", "Nyttig å vite". Filter by name,
   **with a narrow rule**: an early filter on `støtt` dropped *Vitnestøtte* from 33 branches.
3. **Local names → national activities by rule.** Branches name activities their own way:
   *Besøkstjenesten i Bergen*, *Besøksteneste*, *BARK Fyllingsdalen*, *Barnas Raude Kross*. Ordered
   regex rules map a local name to one of Røde Kors's national activities (the 51 in its own system);
   first match wins, the specific before the general (*Besøksvenn med hund* before *besøk*; prison
   visiting before visiting; *psykososial* to Beredskap before *førstehjelp* to Opplæring). 1 270 of
   1 535 provisions map to 32 national activities; the rest are 203 local activities.
4. **The shared national text is reused verbatim.** The hjelpekorps paragraph is on 49 branch
   pages. A text found on 3+ branches is the definition's description; a branch's copy of it is
   removed from the branch (186 copies), so a branch keeps only what it wrote itself.
5. **Branch texts name people.** Coordinators with e-mail and phone are in most texts: 861 phone
   numbers, 900 e-mail addresses and 710 names were taken out of Røde Kors's public texts
   (`description-redaction.md`); 94 branch texts and 15 shared texts are held for review.
6. **Reconcile like the other NGOs.** 349 matched on name. In 47 places the only registered entity
   is the **hjelpekorps** (`ANKENES RØDE KORS HJELPEKORPS`), and the branch page matches it — correct,
   it is the branch's legal entity. One place (Balsfjord) has two registered sub-units and no
   registered branch.
7. **The district tier exists once.** The register still holds Nord- and Sør-Trøndelag; the site
   has one Trøndelag district. Create it once and **reuse it by id** — after reconciliation it
   carries the site's name ("Røde Kors i Trøndelag") and a name-based lookup creates it again.

## What the branch texts settled

| Activity | Atlas today | From the branch texts |
|---|---|---|
| **Visitor** | `elderly_visiting` | confidential conversations with **prisoners** → `prison_reintegration` |
| **EVA** | not a service | a support person for a year after domestic violence, negative social control or trafficking → `crisis_shelter` |
| **Døråpner** | not a service | free evening activity groups after addiction, psychiatry, prison or loneliness → `meeting_place` + `addiction_support` + `prison_reintegration` |
| **Habil** | `family_support` | a volunteer to practise driving with, for a licence → `work_inclusion` |
| **Beredskap** | `first_aid_standby` | also *psykososial førstehjelp* groups (31 branches) → + `crisis_preparedness` |

Equipment lending (*Utstyrsbanken*, *TURBO*, *Utlånssentralen*) appears on several branches — the
same gap as BUA and Kirkens Bymisjon's Skattkammeret (`taxonomy/crosswalk-review.md`).

## Personal data

- Branch e-mails are mostly `<branch>@redcross.no` / `post@<branch>rodekors.no`; a few are personal.
- Activity texts carry coordinators' names, e-mails and phone numbers — stored as published
  (`private_raw`), public text with people taken out, link to the branch page for the original.
- No structured contact persons are read from Røde Kors pages (`published_contacts` 0).

## Acceptance targets

From `acceptance-targets.csv` (measured run 2026-10-04):

| chapters | local / regional / related | both / registry-only / source-only | legal / unregistered | with kommune | coords | regional links | defs | links |
|---:|---|---|---|---:|---:|---:|---:|---:|
| 390 | 361 / 21 / 8 | 349 / 33 / 8 | 381 / 8 | 346 | 0 | 331 | 235 (32 national, 203 local) | 1 535 |

Branches with an address 336, with e-mail 323, with activities 311. Branch-level activity texts
1 289 (median 84 words); definitions with a shared text 161. Source-only: five branches the
register does not hold under any name found (Karasjok, Nesseby, Olden, Rissa, Sveio), Nord-Aurdal,
Årdal, and the `dk-abo` district office. A fresh run will differ somewhat; a large gap is the signal.

## Reference implementation

`reference-code/src/sources/redcross-branches.ts` (discovery, parse, the national-activity rules, the
not-an-activity filter), then the shared steps: `reconcile-chapters.ts redcross`,
`upgrade-hierarchy.ts`, `classify-units.ts`, `build-activity-catalogue.ts redcross --force`,
`redact-descriptions.ts`. It runs as-is (`npm run redcross`, see the package README). In Atlas:
Crawlee + `lib/scraping`, `discover.ts` from the sitemap (de-duplicated), pure `parse.ts` with
golden tests on a branch with expanders (Bergen), one without (Ankenes), a district page and a
section page; `raw.redcross_branch_page` verbatim; reconciliation, hierarchy and the national-name
rules in dbt.

## Open gaps

- No coordinates; location through the address (geocoding, R9).
- The national activity texts (one per activity) are not on rodekors.no in one place; 161
  definitions have a shared text found on 3+ branches, the rest only branch texts.
- 80 of the 203 local activities map to a category with LOW confidence (one-branch social activities);
  see the crosswalk review.
