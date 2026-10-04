# Showing where volunteers are needed

How to indicate that an activity needs more volunteers, so a prospective volunteer can see
where the demand is.

Investigated 22 September 2026. The measurements are the design constraint, so they come first.
frivillig.no figures are from the 21 September harvest (see `source-frivillig-no.md`), which
is not on disk and cannot be re-verified from this folder.

---

## 1. What exists today: one binary signal, and it is not trustworthy as-is

Every source was checked for a demand field.

| Source | Demand data | Verdict |
|---|---|---|
| **frivillig.no missions** | an open listing = someone is recruiting | ✅ The only signal that exists |
| `volunteerCount` | present on **all 2 477** missions, **zero on every one** | ❌ Stripped from the public API |
| `volunteersNotContactedCount` | same — all zero | ❌ Same |
| `basicInfo` | `{missionUrl: {frivillig, optionUrl}}` only | ❌ Just a link flag |
| `contactPositions` | no capacity or need field on any of 3 275 | ❌ |
| **NRX `branchActivities`** | `globalActivityName` + `localActivityName` only | ❌ No demand field |
| **Brreg / ICNPO** | registry data | ❌ Not its job |
| **NGO websites** | "Bli frivillig" links, no per-activity need | ❌ Not machine-readable |

So there is **no quantitative demand data in Norway** — no source publishes how many
volunteers anyone wants.

### 🔴 And the one signal that exists is stale

**All 2 477 frivillig.no missions are flagged `active: true`.** Measured against their
`contactPositions.updatedAt`. ⚠️ The buckets below total **2 191**, not 2 477 — 286 missions
are not in the table — and the shares are of those 2 191:

| Days since last update | Missions | |
|---|---|---|
| <90 days | 352 | **16.1%** |
| 90 days – 1 year | 527 | 24.1% |
| 1–3 years | 580 | 26.5% |
| 3–5 years | 554 | 25.3% |
| **>5 years** | **178** | **8.1%** |

**Median 609 days. Oldest 2 292 days — 6.3 years.** Not one organisation is marked
`deactivated`.

`active: true` means *not deleted*, not *needs volunteers*. Publishing it as demand sends
people to requests filled years ago — and the only asset this feature has is a willing
person's goodwill. Spend it once on a dead listing and they do not come back.

**This single measurement dictates the whole design.**

---

## 2. The model

`volunteerNeed` on each chapter's `activities[]` — see `dist/schema/VolunteerNeed.schema.json`,
generated from `schemas/schemas/v1/volunteer-need.yaml`. ⚠️ **Designed, not published (3 Oct
2026):** no extractor fills it, and the API standard admits a field only once it is observed
populated, so `Activity.volunteerNeed` and `freshness.blocks.demand` were taken out of the
public contract. The schema is kept and still built — parked in `api/_internal/v1/openapi.yaml`
— so the design stays validated; move the `$ref` back onto `Activity` when a producer exists. An object, not a boolean, and deliberately **not** a field on the activity itself:

> an activity changes yearly; a staffing need changes weekly

Three required fields — `status`, `evidence`, `asOf` — and four design rules. Enum values are
UPPER_SNAKE_CASE in the schema (`NEEDED`, `OBSERVED_LISTING`, `FRESH`, …); they are written
lower-case below for readability.

### Rule 1: `unknown` is the honest default, and must never render as "filled"

```
needed   more volunteers wanted
filled   explicitly not recruiting
unknown  nobody has told us
```

Most rows will be `unknown` and that is correct. The asymmetry matters: showing "no need"
for a chapter that is desperate costs a placement *and* the chapter never learns why nobody
came. Showing `unknown` costs nothing.

### Rule 2: there is no `inferred` evidence value

```
declared          the chapter or national office said so          (strongest)
observed_listing  an open recruitment listing was found
none              no evidence either way
```

🔴 **Volunteer demand cannot be derived from absence.** A kommune with no Røde Kors chapter
does not need volunteers — it needs a chapter. Different problem, different intervention,
different person to talk to. The 15 kommuner in `ngo-chapters-findings.md` §6 with none of
the 11 NGOs are a **coverage gap**, and quietly reclassifying that as volunteer demand would
send people somewhere with nothing to join.

Keep the two apart in the data and in any UI.

### Rule 3: demand expires by default

`asOf` is required — a need without a date is not information. `expiresAt` defaults to
**90 days**, matching the 16.1% of listings that are actually under 90 days old.

`freshness` is derived for display:

| Value | Age | Share of frivillig.no today | Volunteer-facing treatment |
|---|---|---|---|
| `fresh` | <90 d | 16.1% | show plainly |
| `ageing` | 90 d – 1 yr | 24.1% | show with a caveat |
| `stale` | 1–3 yr | 26.5% | **do not present as an opportunity** |
| `expired` | >3 yr | 33.4% | **hide; revert to `unknown`** |

On today's data **only one listing in six would be shown without qualification.** That is a
small honest number rather than a large dishonest one.

### Rule 4: `urgency` only ever comes from the organisation

Never inferred from staleness, position count or season. A stale record is not urgent — it
is unknown.

### Fields a volunteer actually chooses on

`roles` (*besøksvenn*, *leksehjelper*, *styreverv*, *sjåfør*) — people pick a role, not an
activity name. `requirements` (politiattest, driving licence, minimum age, language) —
surfacing these up front prevents the wasted round-trip that loses a volunteer.
`commitment` stays free text: frivillig.no has **1 768 distinct values** of `time` across its
the 2 477 harvested missions (an earlier note gave the denominator as 2 447 — a transcription
slip, not a second count; neither can be re-checked, the harvest is not on disk), so
normalising would destroy more than it gains. `applyUrl` is essential — a need
with no route to act on it is not usable.

---

## 3. What can be built now, and what cannot

**Now, with no new inputs:**

- `evidence: OBSERVED_LISTING` for the ~1 356 organisations on frivillig.no, with honest
  freshness. **That is ~1.9% of the register** (1 356 of 72 815). Of their missions, only
  **352 were updated in the last 90 days** — 16.1% of the 2 191 with a usable date (§1) — so
  roughly **350 genuinely current opportunities nationally.** Small, but real and citable.
- Geography is already good: **291 kommuner and 3 275 geocoded points** from mission
  addresses, so "where" works even though "how many" does not.
- `roles` and `commitment` are extractable from mission `name` and `time` today.

**Not possible without a new channel:**

- Any count of open positions. No source publishes it.
- `DECLARED` status for the other ~98.1% of the register.
- Röde Kors's own needs — the NRX API is still returning 500, and its schema has no demand
  field to populate even once it is up.

### The gap worth closing

The valuable version of this feature needs **one cheap action per chapter**: a way for a
lokallag to say *"still need people for X"* and have that timestamped. Not a form to fill —
a single confirm.

Two routes, both outside my reach:

1. **Add a demand field to the NRX Organizations API** and let it flow from whatever Røde
   Kors chapters already use. This is the one NGO where the pipeline could be end-to-end,
   and it would prove the model before asking peers for anything.
2. **Ask Frivillighet Norge to expose `volunteerCount`** — the field already exists on every
   frivillig.no mission and is zeroed in the public API. If it is populated internally, that
   is the national demand dataset, already collected, just not published. **Worth one
   question before building anything to replace it.**

---

## 4. Compliance

⚠️ Two points, both bestemmelse 7 (troverdig og ekte kommunikasjon):

**Publishing stale demand under a Røde Kors name misrepresents other organisations.** A
6-year-old listing shown as an open opportunity tells a volunteer that N.K.S. Alta wants
help when it may not. The `freshness` rules in §2 exist for that reason, not for neatness.

**This is a volunteer-facing surface, so errors have a human cost on both sides** — a
person's willingness spent for nothing, and a chapter fielding enquiries for a role filled
in 2020. Before publishing, show each NGO its own demand rows. Same recommendation as for
the activity categories, and the same reason.

Contact data in demand records follows the rule set in the contract
(`dist/schema/VolunteerNeed.schema.json` — internal until published — and `Contact.schema.json`): `applyUrl` over a named
person wherever both exist.

---

## 5. Open

- Is `volunteerCount` populated inside frivillig.no and merely hidden? Decides whether the
  national demand dataset already exists.
- Can NRX carry a demand field? Blocked behind the 500 anyway.
- What TTL do NGOs consider honest? 90 days is my proposal, not a researched figure —
  worth asking two or three lokallag what they would stand behind.
- Should `filled` be shown at all, or collapsed into `unknown` for display? Arguably a
  chapter that just filled a role still wants to be findable next month.
