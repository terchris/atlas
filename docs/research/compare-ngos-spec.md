# Compare-NGOs page — design spec

Design specification for the cross-organisational comparison surface. This is the page where Jonas, Ola, Tone, and Henrik can look at two or more Norwegian NGOs side by side across activities, funding, scale, and coverage.

Pairs with:
- `goal.md` — product framing (§ Supporting flows: "Compare organisations")
- `personas.md` — Jonas (donor transparency), Ola (data-curious), Tone (civic browsing), Henrik (corporate partnership)
- `ngo-landscape.md` — sector map + leaderboards + per-sector tables
- `common-schema.md` — data model used by this page
- `{org}-profile.md` — underlying org-profile docs
- `{org}-activities.md` / `{org}-activity-indicator-matrix.md` — deeper Tier A data

Status: draft 2026-04-20. Not frozen.

---

## Who this is for (primary personas)

| Persona | What they want to compare |
|---|---|
| **Jonas** (donor transparency) | Efficiency × private-donor-share × mission fit. "If I give to NRC vs SOS-barnebyer vs CARE, what's the honest comparison?" |
| **Ola** (data-curious observer) | Scale, funding sources, structural differences, historical trends |
| **Tone** (civic browsing) | Chapter networks, board composition, activity mix, regional presence — across orgs in her kommune |
| **Henrik** (corporate partnership) | Regional fit × sector × scale × contact path for partnership outreach |

Secondary personas occasionally served:
- **Signe** (national-office planner) — competitor/collaborator view
- **Arne** (district coordinator) — neighbouring-org chapter presence

Not served by this page:
- Åse (crisis band handles her, always present)
- Amira (she wants service-at-time-and-place, not org comparison)
- Kari (she wants activity matching, not org comparison)

---

## Core design principle

**Comparison must be honest about methodology.** The biggest finding from the profile research is that naive metrics mislead:

- Share-to-cause inversely correlates with private-donor share. NRC 97% is because institutional grants are cheap to collect; Plan 76.5% is because fadder acquisition is expensive but produces unrestricted revenue.
- NRC's 9.3 bn NOK income is 98%+ international pass-through; "size" comparisons to domestic orgs mislead.
- "Gov-funded share" via Lottstift alone dramatically understates state dependency for NRC, KN, RS, Folkehjelp — Norad framework agreements and Justis contracts route outside Lottstift.
- Share-to-cause has multiple defensible methodologies. UNICEF gets 4 different numbers depending on year and calculation.

**The page must surface methodology, not hide it.** Every metric shown has a tooltip or footnote explaining what it means and doesn't.

---

## Information architecture

### Entry paths

1. From a single **org profile page** — "Compare with…" CTA adds one more org to the view
2. From the **NGO landscape map** — select 2–4 orgs via checkbox
3. From a **search bar** on the Compare page itself — type org names
4. From the **funding-transparency surface** — click "Compare with similar" on an indicator

### Layout shapes (3 options, decide v1)

**Option A — Side-by-side columns (2–4 orgs)**
- One org per column, same metric rows. Stack vertically on mobile.
- Good for focused comparison of exactly 2–4 orgs.
- Hard to show trendlines over time per metric.

**Option B — Matrix (up to ~15 orgs × 10 metrics)**
- Rows = orgs, columns = metrics. Sort by any column.
- Good for cross-sector browsing.
- Weaker for deep dive into any single org.

**Option C — Combined: matrix for selection, side-by-side for detail**
- Default landing: matrix of all Tier A/B/C orgs.
- Click 2–4 rows to drop into side-by-side detail view.

Recommendation: **Option C**. Matrix as landing + selection, side-by-side as detail. Matches how Tone and Henrik browse (wide first, narrow second).

---

## Metrics shown

Structured into four groups. Each metric has `value`, `year`, `methodology_note`, `source_url`.

### 1. Scale

| Metric | Note |
|---|---|
| Total income (NOK m, 2024) | Always shown |
| Central employees | Brreg antallAnsatte |
| Global employees | For orgs with international ops |
| Chapters / stations / units | Labelled honestly — chapters for RC/NF/NKS/Nasjonalforeningen, stations for RS, bases for Luftambulanse, units for Frelsesarmeen korps |
| Active volunteers | For orgs that report; N/A for donor-only |
| Members / fadder / supporters | Distinguish type — "member" ≠ "fadder" ≠ "støttemedlem" |

### 2. Funding composition

| Metric | Note |
|---|---|
| Norwegian state — Lottstift | Explicit (retrospective registry) |
| Norwegian state — ministry frameworks | Norad + Justis + Helse contracts (outside Lottstift). **Critical for NRC, KN, RS, Norsk Luftambulanse, Folkehjelp comparison.** |
| Foreign-state / EU / UN institutional | NRC's dominant category |
| Private — fadder / monthly / one-time / arv | Broken into sub-types |
| Corporate | For climate orgs (Bellona, ZERO) this is dominant |
| Postkodelotteriet | Flagged as a distinctive Norwegian channel |

Show as **stacked bar** per org (proportion of income by source). Same y-axis scale; different absolute heights.

### 3. Efficiency (with the honest pair)

| Metric | Note |
|---|---|
| Share-to-cause % | Single headline number |
| Methodology footnote | **Required** — what year, what calculation |
| Fundraising cost share | The counterpart metric |
| Admin share | Often < 5%, but varies |
| Share-to-cause × private-donor-share scatter | **The honest pair.** See below. |

#### The "honest pair" scatter chart

X-axis: `private_share_of_income` (0–100%)
Y-axis: `share_to_cause` (50–100%)

Each org = one dot, size = total income.

Observed pattern from our 11 profiled orgs:

```
share-to-cause
  100% ┤ NRC •
       │    Folkehjelp •    (Kirkens Nødhjelp — pending)
   90% ┤    CARE •              LUG •
       │                          Regnskogfondet •
   80% ┤                                  SOS •
       │                                        RS •
   70% ┤                                                Plan •   UNICEF •
       │                                                           Luftambulanse •
   60% ┼──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬
        0  10 20 30 40 50 60 70 80 90 100%
                     private_share_of_income
```

Reading: NRC's 97% share-to-cause is structurally easy because 98% of income is institutional pass-through. UNICEF's 71% and LUG's 89% are the honest numbers given 100% private-donor models. **Orgs should be compared against the trendline, not the raw share-to-cause number.**

### 4. Structural fit (for Tone, Henrik)

| Metric | Note |
|---|---|
| Tier (A / B / B-minus / C) | From `ngo-landscape.md` |
| Chapters in user's kommune | Only if user has set location |
| Board chair, CEO, leadership continuity | Recent transitions flagged (e.g. three-way Sanitetskvinnene ↔ Plan ↔ Redd Barna leadership shuffle) |
| Engagement pathways supported | Pictogram row: volunteer / donate / member / campaign-action / employment |
| Primary focus (humanitarian / health / environment / ...) | Colour-coded |

---

## Filters

- **Focus area**: humanitarian / health / social / youth / environment / civic / patient-support / service-club
- **Size bucket**: income ranges (under 100m, 100–500m, 500m–1bn, 1bn+)
- **Tier**: A / B / C
- **Engagement pathway**: show only orgs that support volunteer (or donate, or member, or campaign action)
- **Geographic presence**: has chapter in kommune X
- **Funding profile**: mostly-private / mixed / mostly-state
- **Share-to-cause**: slider, e.g. ≥ 85%

---

## Interactions

### Select-to-compare
Checkbox on each matrix row, up to 4 orgs. Button at top-right: "Compare selected (2)" → switches to side-by-side.

### Column sorting
Any matrix column is sortable. Default sort: income descending.

### Deep-link to profile
Each org name is a link to its own profile / chapter-finder page.

### Methodology tooltips
Every metric with a `methodology_note` has a hoverable (tap on mobile) `ⓘ` icon explaining what the number means.

### Export
"Last ned som CSV" / "Del denne sammenlikningen" — URL-encodes the current selection + filters so Ola can cite the view in an article.

---

## Edge cases

### NRC-shaped size outliers
NRC's 9.3 bn income is 3× the next-largest (Frelsesarmeen 2.5 bn). On stacked-bar comparisons it dwarfs everything. Handle: log-scale option, or "per NOK of private donation" normalisation, or a footnote that NRC's income is 98% pass-through.

### Tier-C orgs have no chapter data
The Compare page still works — just hides chapter-related columns for those rows. A "chapters" column shows "—" for NRC, SOS, UNICEF, LUG, CARE, Plan.

### Disease-specific orgs in mixed comparisons
Comparing Nasjonalforeningen (health) with Naturvernforbundet (environment) on "share-to-cause" is technically valid but semantically weird. The page should allow it, but a filter by focus-area is the graceful default.

### Share-to-cause methodology mismatch
Four defensible numbers per org. Resolution: pick 2024-calculated (if available) as the default headline; link out to methodology in a footnote. Don't silently blend methodologies.

### Year mismatches
Plan fiscal year is Jul–Jun, everyone else is calendar year. Label income with year. In side-by-side, show year as a caption under each org's income.

### Org name variants
"Norges Røde Kors" vs "Røde Kors" vs "Red Cross Norway". Use Brreg legal name as key, display `brand_name` as primary label, list legal name as secondary.

---

## Data dependencies

Every cell must resolve to `common-schema.md` fields. Minimum viable data per org:

- Organisation.{name, brand_name, tier, primary_focus, scale.*, funding.*, pathways, ceo_name, board_chair_name}
- Organisation.funding has to include `state_via_ministries_nok` and `fundraising_cost_share_pct` — not just Lottstift.
- For orgs with chapters: `Chapter[]` for geographic-presence filter.
- For methodology tooltips: `share_to_cause_note` and per-metric `source_url`.

**If `state_via_ministries_nok` is not populated for an org, the funding stacked bar is misleading and should show a warning.**

---

## Jonas's honest-comparison microflow

Most important flow on the page. Walkthrough:

1. Jonas lands on Compare page from his Google search about "effektiv bistand Norge"
2. Matrix defaults to the 8 humanitarian orgs (NRC, Folkehjelp, KN, Redd Barna, SOS, Plan, CARE, LUG), sorted by income.
3. He sees NRC 97% share-to-cause and thinks "best"
4. Hover ⓘ on NRC's share-to-cause: "97% reflects low fundraising cost because 98% of income is institutional grants (US BHA, UN, EU). Compare with Plan 76.5% whose income is ~76% private — fadder-acquisition is structurally expensive."
5. He scrolls down to the "honest pair" scatter chart. Sees the trendline. Sees Plan's dot is *above* the trendline (better-than-expected efficiency for a private-donor org).
6. He selects NRC + Plan + SOS for side-by-side
7. In side-by-side, each org shows: scale stacked bar, funding composition stacked bar, share-to-cause with methodology, pathways, CEO + chair, link to profile
8. He clicks "Gi her" on Plan → deep-links to Plan's fadder signup with chapter pre-selected to his home kommune if possible

Success metric: Jonas understands that "95%+ share-to-cause" is not a universal quality marker, and picks an org whose funding model matches his values.

---

## Visual style

- Use Digdir Designsystemet components. No custom charts — Digdir tokens + a neutral charting lib (recharts or vx or apexcharts).
- Colour palette per focus-area: humanitarian = red, health = green, environment = teal, youth = blue, social = orange, civic = purple, service-club = grey.
- Typography: Norwegian-public default (Inter or equivalent). Headings in bold, numbers in tabular-nums.
- Accessibility: every chart has a text-table equivalent accessed via a `Vis som tabell` toggle.

---

## Not in v1

- **Trendlines over time.** Most Innsamlingskontrollen data is year-by-year but we don't have multi-year series curated yet. Add in v1.5 once we have 3+ years of consistent profile data.
- **Peer clustering / auto-suggest.** "Orgs like this one" requires a similarity model — out of scope for first release.
- **Beneficiary-outcome metrics.** Share-to-cause is input-efficiency; outcome metrics (children reached, homes built, mines cleared) are different and org-reported without standard. Potential v2.
- **User-saved comparisons.** Requires accounts. Deferred per goal.md non-goals.
- **Cross-year adjusted for inflation.** Requires multi-year series.

---

## Implementation sketch

Two screens:

**1. Matrix screen** (landing)
- Top: filter chips row (focus / tier / size / pathway / share-to-cause slider)
- Middle: sortable table with checkbox column, name (linked), primary_focus (coloured), scale summary, share-to-cause with ⓘ, pathways pictograms
- Bottom: "Compare selected (N)" button if N ≥ 2

**2. Side-by-side screen**
- Top: up to 4 org headers with logos, CEO, founded, tier badge
- Middle: stacked-bar funding composition, then metric rows
- Bottom: scatter chart (share_to_cause × private_share) with selected orgs highlighted, full sector in grey
- CTA row per org: "Gå til profil", "Gi her", "Bli medlem" (where applicable)

---

## Success criteria

- [ ] Jonas can find the honest-comparison scatter in under 60 seconds from landing
- [ ] Every metric with multiple defensible methodologies has a tooltip explaining the choice
- [ ] The page handles 15+ orgs in matrix mode without performance loss
- [ ] Side-by-side supports 2, 3, or 4 orgs cleanly on mobile
- [ ] Tier C orgs render gracefully (hidden chapter columns, not "—" clutter)
- [ ] Export / share URL encodes the current state
- [ ] All metrics link to their source in the profile docs or data sources
- [ ] Methodology notes are in Norwegian (this is the ambient audience)

---

## Open design questions

1. **Default landing filter** — should the matrix open on "all orgs" or "humanitarian orgs" or "orgs in your kommune"? Argue in favour of kommune-filter default since it's the most useful framing for Tone.
2. **Inclusion threshold** — Do we include every Brreg-registered NGO, or only ones with `ngo-landscape.md` entries (~35)? Start with the 35; extend when we have automated profile generation.
3. **Inactive / terminated orgs** — exclude by default, toggle to include for Ola's historical curiosity.
4. **Corporate-partnership framing for Henrik** — should Compare page include a "Partnership readiness" column (has For-bedrifter page, has named partnerships contact, etc.)? Decide after Henrik-flow design.
5. **Multi-language labels** — Norwegian-first. English labels only for orgs with international names (NRC, MSF, WWF).
