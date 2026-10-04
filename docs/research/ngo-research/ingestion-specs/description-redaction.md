# Spec: public activity text without people in it

Cross-cutting. Applies to every activity description an NGO publishes (see the per-NGO specs,
"Full description text"). Measured on the research's 188 descriptions, 2026-10-04.

## Why

An NGO's own description of an activity often names people: "contact our conductor ⟨name⟩ on
⟨number⟩", a rota of priests by first name, the curators of an exhibition. The names are not what
Atlas is for — the activity is. So Atlas shows the text with the people taken out and a link to the
NGO's page for anyone who wants the original.

## Where things go

| Atlas | What | Public |
|---|---|---|
| `private_raw.<source>_activity_page` | the page and its text, verbatim | no |
| `dim_activity.description` | the **public** text: `[telefon]`, `[e-post]`, `[navn]` in place of people | yes |
| `dim_activity.description_source_url` | the NGO's page — shown as "Se originalen hos ⟨NGO⟩" | yes |
| `dim_activity.description_needs_review` | the public text may still hold a person; not shown until checked | internal |
| `private_marts.description_redaction` | what was taken out, by which rule (holds names) | no |

No id or lookup table replaces a person: there is nothing to look up. Published *contacts* (a
chapter's contact person) are a separate, private table — see `INVESTIGATE-ngo-research-handover.md` [Q2].

## The rules, in order

1. **E-mail** and **phone numbers** (8 digits, optionally `+47`, spaced or not; not part of a longer
   number, a date or an organisation number) → `[e-post]`, `[telefon]`.
2. **Known contacts:** the full names of the same NGO's published contacts → `[navn]`.
3. **Role label:** `Prest: Kari`, `Kontaktperson: …` → the name after the label, even a lone
   first name, because the label says it is a person.
4. **Role or contact word:** `vår dirigent, ⟨name⟩`, `drives av ⟨name⟩`, `ta kontakt med ⟨name⟩`
   → the name, when its first word is a known first name, or it is two capitalised words neither of
   which is a known non-person word.
5. **First name + surname:** in every run of capitalised words (a middle initial like `W.` included), the
   first known first name — a double name like *Anne-Britt* counts when its parts are known — and the
   capitalised words after it (up to four in all). Runs, so a title in front (`Biskop …`,
   `Sersjantmajor …`) cannot hide the name. A run ending in a street word (`… vei`, `…gata`) is an
   address and is kept.
6. **Surname:** a capitalised word followed by a surname carried by 200 or more people (SSB 12891),
   when the word before is not a known place or NGO word ("Villa Berg" stays) and the surname is not
   the start of a longer word or a street ("Elias Smiths vei" stays).
7. **Hold for review** what still looks like a person: a known first name alone mid-sentence, or two
   capitalised words mid-sentence that are neither known first names, known non-person words nor
   on the stop list.

Role words are matched in their own case (`[Dd]irigent`), never case-insensitively — a
case-insensitive rule let the name part swallow ordinary lower-case words. Names never run across a
line break (a rota's `Kari⏎Musiker`).

**Word lists — Atlas ingests the two SSB tables itself** (owner decision; merged in Atlas #550,
sources `ssb-10501` and `ssb-12891`, tables `raw.ssb_10501` and `raw.ssb_12891`), so the rules read
the names from there; the research used copies fetched the same day (`data/_reference/`):
- first names: Statistics Norway table **10501** *Personer, etter jente- eller guttenavn* — the
  `Fornavn` variable's 2 152 values (NLOD) — plus the first names of every published NGO contact
  (690), 2 218 in all;
- surnames: Statistics Norway table **12891** *Etternavn brukt av 200 personer eller flere* —
  3 706 surnames (NLOD);
- known non-person words: every kommune name and every word in the NGOs' chapter and activity names
  (~2 000);
- a short stop list of capitalised words that are never people in this text: weekdays, months, the
  NGOs' names, *Gud*, *Jesus Kristus*, *Vår Frue*, platform names.

## Measured

**Run 2 — 1 676 texts, 5 NGOs (2026-10-04, after the Røde Kors crawl):** the 188 national texts of
four NGOs, 161 Røde Kors shared texts, 1 289 Røde Kors branch texts and 38 Frelsesarmeen chapter texts.

| | |
|---|---:|
| phone numbers removed | 878 |
| e-mail addresses removed | 917 |
| names removed | 817 (first name 556, role/contact word 151, role label 107, surname 2, known contact 1) |
| texts held for review | 128 |
| names visible in a text **not** held for review | 0 found |

The branch texts are full of contact blocks, and the first pass on them leaked about 30 names in
texts that were not held. Three causes, each now a rule:

- **double first names** — *Anne-Britt*, *Ole-Jakob* — count as a first name when their parts are;
- **a middle initial** — *Kari W. Hansen* — is part of the name run;
- **a short line** (≤ 6 words, typical of a contact block) is checked from its first word: a name
  alone on a line is no longer skipped as "the start of a sentence".

And one word list fix: Norwegian writes months in lower case, so a capitalised *Mai* before a surname
is a person, not the month. After the fixes, the capitalised words still visible in texts that are
not held are ordinary words and places (*Vår Frue*, *Andre*, *Dovre Bo*, *Per nå* — "as of now").
The 58 removals that looked like places or buildings were all people (surnames such as *Aas*,
*Nygård*, *Guddingstua*). The surname rule (12891) caught two names whose double first names the
other rules missed.

**Run 1 — 188 national texts, 4 NGOs:** 17 phone numbers, 17 e-mail addresses, 107 names; 19 texts
held (4 with a real person, 15 false alarms such as *Guds Ord*, *Bane Nor*, *Human Trafficking*).
Two misses there led to rules 4, 5 and 7 (an unusual first name not in SSB's list; a contact after
"ta kontakt med"); the surname rule's first two hits were false (a street, a district) and led to
the guards in rule 6.

How "0 found" is measured: every capitalised word sequence that contains a known first name, left in
a public text that is not held, is listed and read; every name found must be removed or its text
held. **Limit:** a lone first name in neither list (an unusual name standing alone) is not caught,
and a name with an unknown first name *and* a rare surname is only held, not removed. The review
step, and the link to the original, are part of the design, not an extra.

## False positives to expect

Street names that begin with a first name (handled), organisation and event names of two capitalised
words (held for review, cleared by a person in seconds), and the word *Per* at a sentence start
(not touched — sentence-initial words are skipped).

## Reference implementation

`reference-code/src/lib/redact.ts` (the rules) and `reference-code/src/sources/redact-descriptions.ts`
(word lists, the run over every NGO, the private log). It runs as-is: `npm run redact` after
`npm run descriptions`. In Atlas: a pure function in the dbt-adjacent Python or TypeScript layer that
writes the public text to the mart and the redaction log to `private_marts`; golden tests on a rota,
a "contact our conductor" line, a title before a name, a street that starts with a first name, and
an event text with foreign names.
