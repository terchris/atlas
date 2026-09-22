---
mdx:
  format: md
---

# INVESTIGATE: six two-digit region codes claim to be fylker and are not

## Status

**Open — 2026-09-21.** Found by ops-dev on urb-agents #1354 as failing `relationships` tests
after the `ssb-06913` recovery; the cause is measured and the fix is a decision, not a
discovery.

`classify_region_code` maps `^\d{2}$` to `fylke`. Six codes in `ssb-06913` match that pattern
and are not fylker. Measured against **Klass 104** (35 codes, 1950→now — none of these) and
then against **table 06913's own Region labels**, which is where these names come from:

```
21  Svalbard              22  Jan Mayen        23  Kontinentalsokkelen
25  Utlandet              26  Havområder       88  Ikke bosatt i Norge
```

**3,648 rows** carry them, uniform across the full 1951–2026 history — a dimension gap, not
corruption.

🔵 This is the urb-agents #700 rule — *represent, do not cover* — in the fylke dimension
instead of the kommune one. Those rows keep their `region_code`; what they must lose is the
claim to be a fylke.

## Why it is not already fixed

`classify_region_code` is used by **22 models**. Changing it moves `region_kind` for every
one of them, and `ref_region_kind` is a closed vocabulary with a `relationships` test behind
it, so new members are a seed change plus a gate change. That is a blast radius, not a line.

⚠️ And the classifier **already** knows three of these six — as four-digit codes:

```
svalbard           ^21\d{2}$
jan_mayen          ^22\d{2}$
continental_shelf  ^23\d{2}$
```

So `2100` classifies correctly and `21` does not, for the same place.

## The options, with what each costs

**A — extend the classifier.** Bare `21`/`22`/`23` join their four-digit forms; `25`/`26`/`88`
become new vocabulary. Most faithful, and it makes the two-digit and four-digit forms agree.
⚠️ Needs three new `ref_region_kind` rows with agreed labels, and `region_kind` changes for
any source emitting these codes in all 22 models.

**B — narrow `fylke` only.** `^\d{2}$` minus the six, everything else falls to `unknown`.
Smallest change and it stops the false claim. ⚠️ It throws away what SSB actually told us —
`Utlandet` and `Svalbard` both becoming `unknown` loses a distinction the upstream makes, and
`21` would read `unknown` while `2100` reads `svalbard`.

**C — fix `fylke_nr` per model, leave the classifier.** ⚠️ Rejected on sight: the same
one-off-regex-instead-of-the-macro decision produced the `ssb-06913` defect that surfaced
this. It would be the third instance in one file.

**Recommendation: A**, because the names are SSB's own and already measured, and because B
makes two spellings of Svalbard disagree.

## ⚠️ There is no classification to widen to — measured 2026-09-22

The kommune half of this defect was fixed by widening the Klass window: those twelve codes
exist in Klass 131 from 1950 and the ingest simply asked for a range starting in 1960. **The
fylke half has no such fix.** imac measured the deployed host after a re-ingest
(urb-agents #1369):

```
raw.ssb_klass_fylker carries   01..20, 30..56, 99
of the six offending codes     none
ssb_06913 fylke_nr violations  3 648 rows / 6 codes, UNCHANGED by the re-ingest
```

**SSB's population table carries region codes that SSB's own fylke classification does not
supply, at any date.** So no cadence of re-ingest and no widened window closes this — it has
to be decided in the model or the classifier, which is what makes A or B the only live
options and removes "wait for better upstream data" as an implicit third.

🔵 ⚠️ **A commit titled `docs: file the six two-digit codes that claim to be fylker`
(`89a774e`) sits in a pinned release range and changes nothing.** imac measured it, found no
movement, and reported that *"its stated effect is not observable here and the pin should not
assert it"* — correct, because it has no stated effect. **A filing whose title names a defect
will be read as fixing it; that was a naming error, not a missing prerequisite.**

## The one thing to check before doing it

**Which other sources emit bare two-digit codes in these ranges?** Only `ssb-06913` is known,
and only because it started delivering. ⚠️ A source whose rows never reached the fact cannot
have been seen doing this — the same blind spot that hid the whole defect. Query
`marts.indicators__*` for `region_code in ('21','22','23','25','26','88')` before assuming
the change touches one source.

## Related

- urb-agents #1354 — where ops-dev measured the failing tests
- urb-agents #700 — represent, do not cover
- [SERVING-A-SOURCE](../../SERVING-A-SOURCE.md) trap 6, "not every region code is a kommune"
