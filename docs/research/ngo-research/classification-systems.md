# Classification systems in play

Every taxonomy touched in this research, what it classifies, and whether it is usable.
Compiled 22 September 2026; ICNPO and chapter figures refreshed 2 October 2026 against the
26 September ICNPO pull. Counts are measured unless marked otherwise. frivillig.no figures
come from the 21 September harvest, which is **not on disk** (`ingest/.cache/frivillige.json`
is the Brreg/Atlas pull of voluntary organisations, not frivillig.no), so they cannot be
re-verified from this folder.

**The single most important distinction:** these systems do not classify the same *thing*.
Four different axes are in play, and conflating them is the main way this work goes wrong.

| Axis | Question it answers | Systems |
|---|---|---|
| **Organisation field** | what kind of organisation is this? | ICNPO (×4 variants), NACE, sektorkode |
| **Legal form** | how is it constituted? | organisasjonsform |
| **Activity** | what does it actually do? | frivillig.no purposes, NGO catalogues, NRX activity names |
| **Structure** | where does it sit in a hierarchy? | branchType, `level` |

An organisation can be ICNPO *Idrett*, NACE *93.12*, sektorkode *7000*, form *FLI*, and run
an activity categorised *Barn og unge*. Five codes, five different questions, none
substitutable for another.

---

## 1. Organisation field — the ICNPO family

Four variants of the *same* standard are in circulation, and they are not interchangeable.

| # | Variant | Codes | Coverage | Cardinality | Status |
|---|---|---|---|---|---|
| 1a | **ICNPO standard** (Johns Hopkins / UN) | 12 groups, 24 subgroups | the international reference | single | Rev. 1, 1996. UN/OECD recommended. **Not in the UNSD registry** — no official machine-readable form |
| 1b | **ICNPO — Brreg** (Frivillighetsregisteret) | **46** (14 groups, 32 leaves) | **72 837 orgs, 100%** | **multi — 1.30 avg, 24% have >1** | ✅ **The workhorse.** Machine-readable, NLOD, bokmål + nynorsk, daily |
| 1c | **ICNPO — SSB** (satellite account) | **32** distinct codes in the crosswalk (groups 01–11) | sector aggregates, not orgs | single | ✅ Machine-readable. Carries **money and FTEs** per category |
| 1d | **ICNP/TSO** (UN 2018) | 12 sections | — | single | Successor to ICNPO. Tracks ISIC Rev 4, admits co-ops/mutuals/social enterprises. **Norway does not use it** |

### Why 1b and 1c disagree

| | Brreg (1b) | SSB (1c) |
|---|---|---|
| Groups | **14** | **11** |
| Code format | `1`, `1100` | `01`, `01100` (zero-padded) |
| Language | Norwegian | English |
| Unit | the organisation | economic aggregates |
| Purpose | registration | UN reporting |

SSB drops groups 12, 13 and 14 and merges subgroups for disclosure control — `03900`
collapses Brreg's `3100 + 3300 + 3400`. Crosswalk: `data/_icnpo/icnpo-crosswalk-ssb.csv`
(26 exact, 11 merged, 2 approximate, 1 unmappable, 2 none, 4 Norwegian-only).

### 🔴 Groups 13 and 14 are Norwegian, not ICNPO

`13 Barne- og ungdomsorganisasjoner` and `14 Mangfold og inkludering` have **no
international equivalent**. They are also the second and third most-used *secondary*
categories (4 220 and 2 429 secondary assignments, behind `1300 Rekreasjon og sosiale
foreninger` at 4 724), and their totals rise +122% and +148% over the primary-only count —
so much of Norway's multi-category weight is exactly what cannot be compared cross-country. **84.5%** of the 95 008 assignments map
internationally; **15.5%** do not.

### 🔴 And a trap in Atlas

`brreg_enhet` exposes `icnpo_nummer` / `icnpo_kategori` as **single columns** — the primary
only. The register is multi-valued. **22 171 classifications are invisible** through that
view, hitting hardest in crisis support, inclusion and youth work. Use
`data/_icnpo/icnpo-assignments.csv` instead.

---

## 2. Organisation field — the non-ICNPO codes on every Brreg record

| # | System | Codes | What it is | Use |
|---|---|---|---|---|
| 2a | **Næringskode (NACE / SN2007)** | 5-digit, e.g. `88.996`, `94.992` | EU industry classification. Null on 20 of the 72 815 voluntary organisations (0.03%); the earlier "~2% of the register" can only hold for all of Brreg, which is not on disk to re-check | ⚠️ Not NGO-aware — a Røde Kors lokalforening is *"Andre sosialtjenester uten botilbud ellers"*. Useful as a **filter**: `93.1*` identified 12 111 sports clubs for the `is_idrett` flag |
| 2b | **Institusjonell sektorkode** | 4-digit, `7000` = Ideelle organisasjoner | SSB national-accounts sector | Scope definition — 131 983 units nationally. Broader than Frivillighetsregisteret |

---

## 3. Legal form — not a category system, but constantly mistaken for one

| Code | Meaning | Count |
|---|---|---|
| `FLI` | Forening/lag/innretning | 128 866 |
| `STI` | Stiftelse | 5 976 |
| `AS` / `SA` | Aksjeselskap / Samvirkeforetak, with sektorkode 7000 | 422 |

Used in this work to reclassify NGO-owned AS and stiftelser as `level: RELATED_ENTITY`
(18 at the time of writing; **49** across the 11 organisations in the current data) rather
than chapters — a rehabilitation centre is a real Røde Kors entity but not a
lokalforening.

---

## 4. Activity — what they actually do

This is the axis with **no standard**, which is why `activity-taxonomy.md` exists.

| # | System | Values | Coverage | Cardinality | Assessment |
|---|---|---|---|---|---|
| 4a | **frivillig.no `purposes`** | **19 labels (~15 real)** | 1 337 orgs / **~1.8% of the register** (of 72 815) | **multi — 4.9 avg** (21 Sep; not re-derivable — `source-frivillig-no.md` §3's own table gives ~5.6 per org) | ✅ Best *shape*, worst *coverage*. Activity-level, Norwegian, externally defined, already applied across organisations |
| 4b | **frivillig.no `oldPurposes`** | raw ObjectIds | 706 orgs | multi | ❌ Unfinished migration. Do not use — it is why 4a has duplicate labels |
| 4c | **NGO's own catalogue** | N.K.S.: **11** at first harvest (6 themes + 5 programmes); **14** in the current `activities.json` (12 national, 2 local) | one NGO at a time | multi | ✅ Richest text. **Median 98 words of description each** — the categorisation corpus |
| 4d | **NRX `globalActivityName`** | free text, e.g. *Besøkstjeneste* | Røde Kors only | multi per branch | Canonical name + `localActivityName`. Good model, **no description field** — the gap the extension fills |
| 4e | **`ref_atlas_service_category`** | unknown | unknown | unknown | ⬜ Referenced throughout the Atlas column docs as the FK target for `service_category_code`, **but not exposed via `api_v1`**. Blocks the choice of target taxonomy |

### 4a's duplicate labels

`Friluft og fritid` (551) / `Friluftsliv` (129) / `Fritid` (465) overlap;
`Fattigdom og rusmisbruk` (378) / `Fattigdom og rus` (52) are the same thing;
`Nasjonaldugnad` is near-dead at 9. Normalise before adopting, and record the mapping.

### ICNPO vs purposes — they are complementary, not rivals

| | ICNPO (1b) | purposes (4a) |
|---|---|---|
| Coverage | **100%** | **~1.8%** |
| Cardinality | 1.30 | **4.9** |
| Level | organisation | activity |
| Maintained | once, at registration | by the organisation |

**The overlap is the bridge.** 1 049 organisations carry both (21 Sep harvest, not
re-derivable from disk — and it likely counts frivillig.no *records*: only 880 distinct
orgnrs were confirmed in Frivillighetsregisteret, where ICNPO lives), and ICNPO predicts the
dominant purpose strongly — `trosOgLivssyn → Tro og livssyn` 100%, `barneOgUngdom → Barn
og unge` 98%, `idrett → Idrett` 95%, and **zero of the top 10 below 60%**. So the ~1.8% is
a training set for extending purpose-style categories across all 72 837, not a dead end.

⚠️ Two limits: ICNPO recovers the *dominant* purpose but never the full set of 4.9; and
the 1 049 are self-selected urban/staffed/social-sector, so a mapping learned there fits
rural volunteer-run lag worst — which is where coverage questions actually get asked.

---

## 5. Structure — hierarchy, not category

| # | System | Values | Note |
|---|---|---|---|
| 5a | **NRX `branchType`** | `Lokalforening`, `Distrikt`, `Nasjonalkontor` | Røde Kors-specific. Other NGOs say *Sanitetsforening*, *Speidergruppe*, *Sanitetslag* |
| 5b | **`Chapter.level`** | `NATIONAL`, `REGIONAL`, `LOCAL`, `RELATED_ENTITY` | The portable equivalent, comparable across NGOs |
| 5c | **`parentOrganization`** (frivillig.no) | declared edge | Not a taxonomy but does the same job — **348 orgs declare a parent**, which no register holds |

---

## 6. From the funding side (`../money/`)

Listed for completeness — these classify *money*, not organisations, and are verified in
the funding research rather than here.

| # | System | Where | Note |
|---|---|---|---|
| 6a | **ICNPO in tilskudd.no** | `ICNPO-nr.` / `ICNPO-kategori` per grant row | Same taxonomy as 1b, on awards. Matches `ref_brreg_icnpo.csv` |
| 6b | **DAC sector codes** | Norad microdata | `dac_main_sector_code`, `dac_sub_sector_code` — OECD standard for aid |
| 6c | **SDG targets** | Norad `sd_target[]` | Targets, not just goals |
| 6d | **EU data theme** | Atlas manifests | `GOVE`, `SOCI`, `HEAL`, `EDUC`, `JUST` — dataset metadata, not content |

---

## 7. Home-made vocabularies in this research

Flagged explicitly so nobody mistakes them for standards:

| Field | Values | Status |
|---|---|---|
| `targetGroups` | *eldre*, *innvandrerkvinner*, *voldsutsatte*… | ⚠️ Keyword-extracted from each NGO's own words. Deliberately **not** normalised — doing so is a separate reviewable step |
| `deliveryModes` | *lavterskel*, *utendørs*, *gruppe*… | ⚠️ Same |
| `is_idrett` | boolean | Proposed, derived from NACE `93.1*` — not in the schema or data |
| `isService` | in `ActivityDefinition`, not yet populated systematically | Separates beneficiary services from internal activity — *Næringsliv* has 152 words and no target group because it is guidance on business partnerships, not a service |

---

## 8. International and EU systems — checked 22 September 2026

The user's question was whether the EU or others have something better. Short answer:
**no one has a good NGO activity classification, and the EU does not have one at all.**

| # | System | Custodian | Codes | Unit classified | Machine-readable | Verdict |
|---|---|---|---|---|---|---|
| 8a | **COPNI** | **UN Statistics Division** | 9 divisions, ~33 classes | **expenditure purposes** of NPIs | ✅ HTML, Text, **RDF**, Access — 6 languages | ⚠️ Wrong axis (see below) |
| 8b | **ICNPO** | Johns Hopkins / UN handbook | 12 groups, 24 subgroups | organisations | ❌ PDF annex only | The de-facto standard |
| 8c | **ICNP/TSO** | UN (2018) | 12 sections | organisations | ❌ PDF | Successor to 8b. Applied in Austria; not Norway |
| 8d | **NACE Rev. 2 / SN2007** | Eurostat / SSB | group 94 = **17 codes** | industry | ✅ SSB KLASS API, EU vocabularies | ❌ Useless here (see below) |
| 8e | **EU Data Themes** | EU Publications Office | **14** | **datasets** | ✅ RDF/SKOS | ⚠️ Wrong axis — dataset metadata |
| 8f | **EuroVoc** | EU Publications Office | ~7 000 concepts | **documents / subjects** | ✅ RDF/SPARQL | ⚠️ Wrong axis — a thesaurus for indexing legislation |
| 8g | **NTEE** | US IRS / Urban Institute (NCCS) | **26 major groups (A–Z)** under 10–12 broad categories; codes `letter+2 digits` → 600+ | organisations | ✅ US only | Single-valued by tradition |
| 8h | **UK-CAT** (UK Charity Activity Tags) | NCVO / Sheffield Hallam / D. Kane | **230 tags in 24 categories** | organisations, **multi-valued, multi-axis** | ✅ **CSV on GitHub, CC-BY 4.0** | ⭐ **The closest prior art** |
| 8i | **ICNP/TSO — machine-readable** | UN taxonomy, published as CSV by the UK project | **127 rows**: 12 sections A–L, 50 groups, 65 sub-groups | organisations | ✅ **CSV, CC-BY 4.0** | Includes an **ICNPO crosswalk** |
| 8j | **NCVO Civil Society Almanac** | UK (NCVO) | uses **ICNPO**, with UK sub-splits (e.g. *ICNPO 4.1 Scout groups and youth clubs*) | organisations | — | Independent confirmation of ICNPO for comparability |
| 8k | **COFOG** | UN / Eurostat | government functions | **government spending** | ✅ | Sibling of COPNI; not applicable |

### 8a — COPNI: the one I should have found first, and it still is not the answer

**COPNI is in the UNSD Classifications Registry, and ICNPO is not.** Full title
*Classification of the Purposes of Non-Profit Institutions Serving Households*, adopted
1999, Series M No. 84, custodian UNSD, published in English, French, Spanish, Arabic,
Russian and Chinese, downloadable as structured text and RDF. On paper it is exactly what
"a UN standard with a dataset" should look like.

It is still the wrong tool, and its own structure shows why:

```
02   Health
  02.1.1  Pharmaceutical products
  02.1.2  Other medical products
  02.2.2  Dental services
05   Social protection
07   Political parties, labour and professional organizations
09   Services n.e.c.
```

**It classifies what money is spent on, not what kind of organisation exists.** It sits in
the COFOG / COICOP / COPNI / COPP family of *expenditure* classifications for national
accounts. Nine divisions with no "International", no "Philanthropic intermediaries" and no
development/housing beyond Housing itself — a humanitarian NGO and a pharmacy subsidy land
in comparable places.

Useful for: reconciling NGO *spending* against national accounts. Useless for: "who works
with young people in this kommune".

### 8d — NACE: measured, and it fails hard

NACE is the EU's actual organisational classification, and Norway's SN2007 is NACE Rev. 2.
Its entire treatment of civil society is **group 94, seventeen codes** — business,
professional, union, religious, party-political, and "other".

Measured across the 72 815 voluntary organisations:

| NACE code | Orgs | Share |
|---|---|---|
| **94.992** *Andre medlemsorganisasjoner ellers* | **41 360** | **56.8%** |
| 93.120 Idrettslag | 11 281 | 15.5% |
| 90.201 Kunst/underholdning | 4 383 | 6.0% |
| 94.910 Religiøse organisasjoner | 2 809 | 3.9% |

**57.4% of voluntary organisations fall into the single `94.99*` catch-all.** NACE tells you
nothing about what four in seven Norwegian voluntary organisations do. It is a filter
(`93.1*` found the 12 111 sports clubs) and nothing more.

### 8e/8f — the EU has no NGO classification

`data.europa.eu` classifies **datasets** by the 14-value DCAT-AP Data Theme vocabulary —
`AGRI, ECON, EDUC, ENER, ENVI, GOVE, HEAL, INTR, JUST, OP_DATPRO, REGI, SOCI, TECH, TRAN`.
That is metadata about datasets, which is why Atlas already uses it in source manifests
(`eu_theme: GOVE`) and why it can never classify an organisation.

EuroVoc is a subject thesaurus for indexing EU documents. A SPARQL probe for
non-governmental / non-profit / voluntary-organisation concepts returned nothing usable —
wrong axis again. The EU's social-economy work exists as policy and satellite-account
guidance, not as a published classification with codes.

### 8h — UK-CAT: someone has already done this, and licensed it openly

The **UK Charity Activity Tags** project classified *every* UK registered charity. It is the
closest thing to prior art for what `activity-taxonomy.md` proposes, and it validates the
method independently:

> sample charities → design the taxonomy → **manually classify a sample** → **machine
> learning** → **rules-based classification**

That is the same sequence proposed here, already executed at register scale.

**230 tags across 24 categories**, each a 2-letter code plus 3 digits:

```
AF Armed forces   AN Animals    AR Arts (19)   AS Associations (15)
BE Beneficiary group (17)       CA Charitable activities   CC Childcare
CJ Crime and Justice   CV Charity and VCS support   EC Economic and community dev (11)
ED Education (19)   EN Environment   FA Facilities   HE Health (32)
HO Housing   HR Heritage   LE Leisure   PR Professions   RL Religion (21)
RS Research   SC Social care   SL Saving of lives   SO Society   SW Social welfare (14)
```

🔑 **It is multi-axis.** `BE Beneficiary group` classifies *who is served* separately from
what the organisation does — *Asylum seekers and refugees, Children, Families, LGBTQ+,
Migrants, Older people, People with learning disabilities, Racial; ethnic or national
communities, Women, Young people…*

That is exactly the `targetGroups` field invented by hand in `ingest/src/sources/nks-activities.ts`.
**A published, peer-reviewed, CC-BY taxonomy already exists for it**, which is a strong
argument for adopting rather than inventing.

Downloads (all CC-BY 4.0, `github.com/charity-classification/ukcat`): `ukcat.csv` (the
schema), `icnptso.csv`, `sample.csv` + `top2000.csv` (the **manually classified training
sets**), and `charities_active-ukcat.csv` / `charities_active-icnptso.csv` (results for every
active charity, under both schemes).

### 8i — ICNP/TSO is machine-readable after all

§1d and §8c said PDF only. **Corrected:** the UK project publishes it as CSV —
`data/_reference/icnptso-un-2018.csv`, 127 rows. And its `Notes` column is an
**ICNPO → ICNP/TSO crosswalk**.

Five boundaries moved and one section is new, so a naive 1:1 group mapping would be wrong:

| ICNP/TSO | Change from ICNPO |
|---|---|
| B Education | **research moved out** to K10 |
| D Social services | **employment and training moved in** from ICNPO 6 |
| E Environment | **advocacy moved out** to G12 |
| F Community and economic development, housing | **vocational rehabilitation moved out** to D40 |
| G Civic, advocacy, political **and international** | **ICNPO 9 International folded in** |
| K Professional, scientific, accounting, administrative | **newly added** |

Notably, ICNP/TSO has **no equivalent of Brreg's 13 or 14** either — the Norwegian additions
remain Norwegian under the newer standard too.

### The finding that matters for the decision

The literature comparing these systems notes that **NTEE and ICNP/TSO have traditionally
allowed a single category per organisation**, while charity registers allow multiple, and
that this is *"a practical rather than conceptual"* difference.

**Brønnøysund's ICNPO is already multi-valued** — 1.30 categories per organisation, 24%
with more than one, 95 008 assignments over 72 837 organisations. On the single dimension
where the international implementations are weakest, the Norwegian register is ahead of
them. That is an argument for building on 1b rather than migrating to anything else.

---

## Recommendation

1. **ICNPO (1b) as the backbone.** 100% coverage, multi-valued, hierarchical, bilingual,
   daily, NLOD, and internationally anchored for 84.5% of assignments. **Read it from
   `icnpo-assignments.csv`, never from `brreg_enhet`'s single column.**
2. **Settle `ref_atlas_service_category` (4e) before designing anything.** If it exists and
   is populated, the activity-taxonomy question is a mapping exercise, not a design one.
3. **Otherwise adopt frivillig.no `purposes` (4a), normalised**, as the activity target —
   and use the 1 049-org overlap to extend it.
4. **Keep the axes separate.** ICNPO on the organisation, purposes on the activity, NACE as
   a filter, legal form as legal form. Never collapse them into one "category" column.
5. **Exclude groups 13 and 14 explicitly** in anything international — never silently fold
   them into *Other*.
6. **Do not migrate to COPNI, NACE, EU themes or EuroVoc.** COPNI classifies expenditure,
   NACE puts 57% of the sector in one box, and the EU vocabularies classify datasets and
   documents. Add **COPNI as a secondary mapping** only if NGO spending ever needs
   reconciling against national accounts.
7. **Watch ICNP/TSO.** The UN's current recommendation, which Norway has not adopted. Now
   machine-readable (`data/_reference/icnptso-un-2018.csv`) with an ICNPO crosswalk, so the
   migration is costed whenever it is asked for. Note it has **no equivalent of groups 13/14
   either**.
8. **Evaluate UK-CAT (8h) seriously before designing an activity taxonomy.** 230 tags,
   24 categories, multi-valued, CC-BY 4.0, with a published beneficiary-group axis and
   manually-classified training data. Adapting it to Norwegian beats inventing a scheme,
   and it would make Norwegian results comparable to the UK. **The `targetGroups` field
   invented here duplicates their `BE` axis — switch to theirs.**
