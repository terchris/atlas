# Source assessment: frivillig.no

Analysed 21 September 2026. Full harvest: **1 356 organisations, 2 477 of 3 063 missions.**
Operated by Frivillighet Norge. Undocumented but open API.

⚠️ **The harvest is not on disk**, so every frivillig.no figure in this document is as
measured on 21 Sep 2026 and cannot be re-verified from this folder. (`ingest/.cache/frivillige.json`
is unrelated: it is the Brreg/Atlas pull of 72 815 voluntary organisations.) The canonical
figures used across the other documents are the ones on this page: **1 356 organisations;
2 477 distinct missions harvested of 3 063 declared; `purposes` on 1 337 organisations.**

**Verdict: the most valuable non-register source found so far.** (It was first thought to
solve a problem written off as unsolvable — the unitary NGOs' local units — but that problem
turned out to be solvable in Brreg too; see §2.) It also carries risks that make it unusable as a census.

---

## 1. The API, properly reverse-engineered

Earlier I guessed `{"query": "..."}` and it was silently ignored — the totals came back
unfiltered and I mistook that for "filters don't work". The real parameter set is the Redux
`search.query` initial state in `/assets/index-*.js`:

```jsonc
POST https://www.frivillig.no/api/search/
{
  "searchKeyword": "",        // free text — NOT "query"
  "purposes": [],             // category filter
  "tasks": [],                // task-type filter
  "place": "",                // place name
  "position": null,           // {lat,lng} + radius
  "isShowingMissions": true,
  "alphabeticLetter": null,
  "alphabeticInterval": null,
  "offset": 0,
  "limit": 50                 // caps near 500
}
```

Response: `{result: {missions: {hits, total}, organizations: {hits, total}}}`.

⚠️ **Paging is not stable.** Walking `offset` 0→4000 at `limit=500` returned 2 477 *distinct*
missions out of a declared 3 063 — pages overlap, so there is no ordering guarantee. All 1 356
organisations were recovered. Deduplicate on `_id` and never trust a single pass to be complete.

Other endpoints in the bundle: `/api/organization/get-organization`, `/api/search/csv`,
`/api/kartverket/enhance-position`.

---

## 2. 🔑 The headline: it sees chapters Brønnøysund structurally cannot

Two mechanisms, both absent from every register:

### a. `parentOrganization` — affiliation, declared

348 organisations (26%) declare a parent. It is a MongoDB ObjectId serialised as a byte
buffer, so it needs decoding:

```python
oid = bytes(org["parentOrganization"]["buffer"]["data"]).hex()
```

158 resolve within the harvest, across 49 distinct parents. **This is the org→chapter edge
that `ngo-chapters-findings.md` §4 said had to be inferred with a confidence score.** Here it
is stated by the organisation itself.

It also captures intermediate levels: *Oslo Røde Kors - Avdeling Ungdom* → *Oslo Røde Kors*
(a distrikt), not straight to national.

### b. Shared orgnr — sub-units with no legal identity

**74 organisation numbers are shared by 282 frivillig.no records.** frivillig.no lets a unit
register without its own legal entity, which is exactly what a register cannot represent:

| Orgnr | Records | Organisation |
|---|---|---|
| 984410441 | **37** | Home-Start Norge + 36 local Home-Starts |
| 938679177 | 33 | NLM Gjenbruk shops |
| 961847818 | 12 | Oslo Røde Kors + BARK, Avdeling Ungdom, … |
| 938498318 | **11** | Frelsesarmeen |
| 951812528 | 8 | Kreftforeningen distriktskontorer |
| 957914330 | 7 | Forandringshuset |
| 944384448 | 5 | Kirkens Bymisjon |

### What that does to the two unitary NGOs

`ngo-chapters-findings.md` §4 concluded: *"no registry-based method can ever work"* for
Frelsesarmeen and Kirkens Bymisjon.

⚠️ **That conclusion has since been withdrawn.** Both organisations register their local
units in Brreg as **sub-units** (`underenheter`), an endpoint that had not been queried:
Frelsesarmeen 175, Kirkens Bymisjon 151. See `ngo-chapters-findings.md` §4 for the
correction and how the error survived.

frivillig.no therefore does not go *round* a hard limit; it is a third source that happens
to see some of the same units, and a small minority of them:

| NGO | Brreg `enheter` | Brreg `underenheter` | frivillig.no units |
|---|---|---|---|
| **frelsesarmeen** | 1 | **175** | 11 |
| **kirkens-bymisjon** | 3 | **151** | 6 |

```
Frelsesarmeen Norge · Trondheim · Hokksund · Levanger · Oslo sentrum
Bamble og Porsgrunn · Kristiansand · Framnes Asylmottak · Varmestua Molde
AVD HAUGESUND KORPS · FLEKKEFJORD
```

⚠️ **The inverse is just as stark.** For the nine *federated* NGOs frivillig.no adds almost
nothing — Sanitetskvinnene 464 → 0, 4H 495 → 0, LHL 229 → 0 (registry chapter counts at the
time; after reconciliation the datasets hold 575, 593 and 285). It is complementary to Brreg,
not an alternative. The rule that replaces *"Brreg for federated NGOs, frivillig.no for
unitary ones"* is simply: **Brreg for both, `enheter` for federated and `underenheter` for
unitary.** frivillig.no's value is what neither endpoint holds — volunteer demand.

---

## 3. The `purposes` taxonomy — complete

Applied to 1 337 organisations and all 2 477 missions.

| Purpose | Orgs | Missions | | Purpose | Orgs | Missions |
|---|---|---|---|---|---|---|
| Barn og unge | 979 | 1 330 | | Utdanning | 233 | 346 |
| Lokalmiljø | 948 | 1 594 | | Tro og livssyn | 224 | 230 |
| Helse og sosial | 686 | 1 021 | | Miljø og dyr | 218 | 268 |
| Eldre | 587 | 721 | | Idrett | 208 | 290 |
| Friluft og fritid | 551 | 658 | | Beredskap | 202 | 124 |
| Flyktninger | 521 | 566 | | Politikk og internasjonalt | 146 | 212 |
| Fritid | 465 | 881 | | *Friluftsliv* | 129 | 170 |
| Kultur og festival | 465 | 482 | | *Fattigdom og rus* | 52 | 91 |
| Samfunn | 446 | 884 | | *Nasjonaldugnad* | 9 | 5 |
| Fattigdom og rusmisbruk | 378 | 261 | | | | |

⚠️ **19 labels, ~15 real categories.** `Friluft og fritid` / `Friluftsliv` / `Fritid` overlap;
`Fattigdom og rusmisbruk` / `Fattigdom og rus` are the same thing; `Nasjonaldugnad` is
near-dead at 9. A separate `oldPurposes` field on 706 orgs holds raw ObjectIds — this is an
unfinished migration, and any adoption must normalise and record the mapping.

Reconciling the average: the Orgs column sums to **7 447 label assignments**, i.e. **~5.6
labels per organisation** (7 447 / 1 337); the Missions column sums to 10 134, ~4.1 per
mission. The **"4.9 avg"** quoted in `classification-systems.md` §4a and
`data/_icnpo/README.md` is the 21 Sep figure and cannot be re-derived from this table or
from anything on disk — treat it as unverified; all three numbers say "multi-valued".

---

## 4. A 130 000-word description corpus

| Field | Coverage | Median length |
|---|---|---|
| `description` | 1 339 (98.7%) | **77 words** |
| `shortDescription` | 1 355 (99.9%) | 36 words |

**129 979 words of organisation self-description, each already tagged with `purposes` by the
organisation itself.** For the categorisation work in `activity-taxonomy.md` that is not just
more text — it is *labelled training and validation data*, produced by the organisations
rather than by us. Nothing else found so far offers that.

---

## 5. Everything else on the record

| Field | Coverage | Note |
|---|---|---|
| `number` (orgnr) | 1 148 distinct / 1 356 records | 2 contain spaces — strip before joining |
| `registeredInFrivillighetsregisteret` | 920 (68%) | Self-declared; measured against Atlas, **880 of 1 148 (77%) actually are** |
| `religious` | 204 true | Plus `religiousDescription` on 148 |
| `political` | 6 true | |
| `webpage` | 1 218 (90%) | Corroborates the hostname signal used in Phase 1 |
| `contactPerson` | 1 223 (90%) | Personal data |
| `municipality` | 142 (10%) | Thin — use mission geography instead |
| `volunteerCount` | 100% present, **all zero** | Zeroed in the public API. The field exists; the numbers do not |

**Mission geography is the strong part:** 291 distinct kommuner, 33 fylker, and **3 275
contactPositions carrying lat/lng**. Free-text `time` on 98.8% of missions, though it is
unstructured — 1 768 distinct values, the most common being *"Vi finner en tid som passer deg"*
(437).

---

## 6. Where it must not be trusted

- **Not a census.** 1 356 organisations against 72 815 in Frivillighetsregisteret — **1.9%**
  (1 337 with `purposes` — 1.8%).
  Self-selected toward organisations that recruit volunteers online: urban, staffed, social
  sector. Any rate or share computed from it describes frivillig.no, not Norway.
- **268 of 1 148 orgnrs are not in Frivillighetsregisteret** (23%), and self-declaration
  disagrees with reality by 9 points. Verify against Brreg; do not take the flag.
- **Snapshot only.** Active missions, no history. A time series has to be built by snapshotting.
- **Unstable paging** (§1) — always dedupe.
- **Licence unknown.** Frivillighet Norge is a peer body. No terms found, no NLOD. The
  courtesy mail recommended for Sanitetskvinnene applies here too, and one mail can cover both
  since Frivillighet Norge is the umbrella.

---

## 7. What to do with it

1. **Use it as a third source for the two unitary NGOs** — not the primary one. Brreg
   `underenheter` (175 and 151) is now the main route to Frelsesarmeen's and Kirkens
   Bymisjon's local units (§2); frivillig.no's 11 and 6 units corroborate a minority of them.
   An earlier version of this list called it "the only source"; that was withdrawn with
   `ngo-chapters-findings.md` §4.
2. **Use `parentOrganization` as a second affiliation signal** for the federated NGOs where it
   exists. Declared affiliation is stronger evidence than a name pattern, and this folder's
   rule is that two independent sources agreeing is what raises confidence.
3. **Use the description corpus as labelled data** for the common-category work. 1 339
   descriptions already carrying the organisation's own `purposes` is the validation set
   `activity-taxonomy.md` §6 needs.
4. **Treat `purposes` as a strong candidate target taxonomy** — but normalise the ~4 duplicate
   labels first, and record the mapping.
5. **Do not compute coverage, share or trend figures from it.** 1.9% of the sector, self-selected.

## 8. Open

- Licence and rate limits — mail Frivillighet Norge, same note as N.K.S.
- `/api/search/csv` — a CSV export exists in the bundle but was not reached; may be cleaner
  than paging.
- `/api/organization/get-organization` may return more per-organisation than the search hit.
- Are the 268 orgnrs not in Frivillighetsregisteret genuinely unregistered, or sub-units
  borrowing a parent's number? §2b suggests the latter for at least some.
