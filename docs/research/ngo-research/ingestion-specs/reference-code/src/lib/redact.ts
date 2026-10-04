/**
 * file: ingest/src/lib/redact.ts
 * description: Take people out of an organisation's text, so the text can be shown publicly.
 *
 * The names are not what Atlas is for - the activity is. So a public description shows a neutral
 * marker where a person was, and links to the organisation's own page for anyone who wants the
 * original (`descriptionSourceUrl`). Nothing is replaced by a lookup id: there is nothing to look up.
 *
 *   phone numbers  -> [telefon]      pattern
 *   e-mail         -> [e-post]       pattern
 *   names          -> [navn]         four methods, strongest first:
 *     KNOWN        a published contact of the same organisation, matched whole
 *     ROLE_LABEL   "Prest: Kari", "Kontaktperson: …"
 *     ROLE_WORD    "vår dirigent, Ola Nordmann", "drives av Kari Hansen (pedagog)"
 *     FIRST_NAME   a known first name followed by a capitalised surname, mid-sentence
 *
 * Whatever still looks like a name afterwards makes the text `needsReview`: it is held back
 * from public use until a person has looked. The detector WILL miss some names; that check is the
 * safety net, not an extra.
 */

export interface Redaction { kind: 'PHONE' | 'EMAIL' | 'NAME'; method: string; original: string; }
export interface Redacted { text: string; redactions: Redaction[]; needsReview: boolean; suspects: string[]; }

const UP = 'A-ZÆØÅÉ';
const LO = 'a-zæøåéü';
const NAME_TOKEN = `[${UP}][${LO}]+(?:-[${UP}][${LO}]+)?`;
/** Capitalised words that are never a person: start-of-text words, places, the NGOs' own vocabulary. */
const NOT_NAMES = new Set(`
  Vi Du Det Den De Dere Her Hos Når Hvis Som Og Eller Men For Til Med Om På Av Alle Er Har Kom Velkommen Ta
  Mandag Tirsdag Onsdag Torsdag Fredag Lørdag Søndag Januar Februar Mars April Juni Juli August September Oktober November Desember
  Frelsesarmeen Kirkens Bymisjon Bymisjonen Røde Kors Sanitetskvinnene Nasjonalforeningen Norge Norsk Norske Oslo Bergen Trondheim Stavanger
  Kristiansand Tromsø Drammen Asker Bodø Ålesund Haugesund Tønsberg Sandefjord Moss Halden Harstad Molde Narvik Arendal Egersund Sandnes
  Kirkenes Finnmark Rogaland Vestland Viken Agder Troms Nordland Trøndelag Innlandet Vestfold Telemark Østfold Akershus Buskerud
  NAV Gud Jesus Kristus Kristi Jesu Bibelen Facebook Instagram Vipps Kiwi Coop Rema Matsentralen Fretex Gatehospitalet Home-Start Asfalt
  Vår Frue Pride Sammen Robust Enter Spenn Kudos Lag Andre Andres Finn
  Bydel Stiftelsen Villa Kafé Kafe Camp Senter Senteret Huset Hus Kirke Kirken Gården Prosjekt
`.split(/\s+/).filter(Boolean));

/** First names that are also ordinary words at the start of a sentence ("Per nå", "Andre aktiviteter", "Finn ut"). */
const SENTENCE_WORDS = new Set('Per Andre Andres Finn Bo Liv Dag Tor Even Kai Mai Sol Ask Hans Hel Vår Ulf Bjørn Ørn Gro Ung Line'.split(' '));

const ROLE_WORDS = 'prest|prester|musiker|dirigent|leder|daglig leder|nestleder|styreleder|kontaktperson|kontakt|koordinator|frivillighetskoordinator|'
  + 'korpsleder|korpsledere|kurator|kuratorer|pedagog|sykepleier|lege|diakon|sosionom|rådgiver|konsulent|avdelingsleder|enhetsleder|'
  + 'sekretær|kasserer|instruktør|ansvarlig|kokk|konditor|vaktmester|miljøarbeider|prosjektleder|tillitsvalgt|organist|kantor|pianist|'
  + 'biskop|major|kaptein|løytnant|sersjantmajor|sokneprest|pastor';
/** Each role word in lower case or with a capital first letter - never case-insensitive as a whole, which let
 *  the NAME part swallow lowercase words ("… tlf", "… lager alt"). */
const caseless = (alts: string) => alts.split('|').map((w) => `[${w[0].toUpperCase()}${w[0]}]${w.slice(1)}`).join('|');
const ROLES = caseless(ROLE_WORDS);
const CONTEXT = caseless('drives av|ledes av|kontakt med|snakk med|ring|spør etter');

const PHONE = /(?:\+47[\s ]?)?(?<![\d.,])(?:\d[\s ]?){7}\d(?![\d.,]\d)/g;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]*\w/g;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * `notPeople`: capitalised words known NOT to be people - every kommune name and every word in the
 * NGOs' own chapter and activity names. Two capitalised words in a row that are in neither list
 * nor known names are held for review ("UNKNOWN_PAIR"): that is how a name whose first name is
 * not in SSB's list (a German or a stage name) is still caught.
 */
export function redact(input: string, knownNames: string[], firstNames: Set<string>, notPeople: Set<string> = new Set(),
  surnames: Set<string> = new Set()): Redacted {
  const redactions: Redaction[] = [];
  let text = input;
  // A double first name ("Anne-Britt", "Ole-Jakob") is a first name when its parts are.
  const isFirst = (w: string) => firstNames.has(w) || (w.includes('-') && w.split('-').every((p) => firstNames.has(p)));
  const sub = (re: RegExp, kind: Redaction['kind'], method: string, mark: string,
    pick: (m: RegExpExecArray) => { whole: string; name: string } | undefined) => {
    text = text.replace(re, (...args) => {
      const m = args.slice(0, -2) as unknown as RegExpExecArray;
      const hit = pick(m);
      if (!hit) return m[0];
      redactions.push({ kind, method, original: hit.name });
      return m[0].replace(hit.name, mark);
    });
  };

  sub(EMAIL, 'EMAIL', 'PATTERN', '[e-post]', (m) => ({ whole: m[0], name: m[0] }));
  sub(PHONE, 'PHONE', 'PATTERN', '[telefon]', (m) => ({ whole: m[0], name: m[0].trim() }));

  // KNOWN: longest first, so "Kari Hansen" goes before "Kari".
  for (const n of [...new Set(knownNames)].filter((n) => n.split(' ').length >= 2).sort((a, b) => b.length - a.length)) {
    sub(new RegExp(`(?<![${UP}${LO}])${escape(n)}(?![${LO}])`, 'g'), 'NAME', 'KNOWN', '[navn]', (m) => ({ whole: m[0], name: m[0] }));
  }

  // Tokens are joined by a space or tab only: a name never runs across a line break ("Kari\nMusiker").
  const nameSeq = `(${NAME_TOKEN}(?:[ \\t]${NAME_TOKEN}){0,2})`;
  const isName = (seq: string) => {
    const toks = seq.split(/\s+/);
    return !toks.some((t) => NOT_NAMES.has(t));
  };
  // ROLE_LABEL: "Prest: Kari" - a single first name counts here, because the label says it is a person.
  sub(new RegExp(`\\b(?:${ROLES})[ \\t]*:[ \\t]*${nameSeq}`, 'g'), 'NAME', 'ROLE_LABEL', '[navn]',
    (m) => (isName(m[1]) ? { whole: m[0], name: m[1] } : undefined));
  // ROLE_WORD: "vår dirigent, Ola Nordmann" / "drives av Kari Hansen" - needs a known first name.
  sub(new RegExp(`\\b(?:${ROLES}|${CONTEXT})\\b,?[ \\t]+(?:er[ \\t]+)?${nameSeq}`, 'g'), 'NAME', 'ROLE_WORD', '[navn]',
    (m) => {
      const toks = m[1].split(/\s+/);
      const unknownPair = toks.length >= 2 && toks.every((t) => !notPeople.has(t));
      return isName(m[1]) && (isFirst(toks[0]) || unknownPair) ? { whole: m[0], name: m[1] } : undefined;
    });
  // FIRST_NAME: in every run of capitalised words, the first known first name and what follows it
  // (up to three more words). Runs, not a single regex match, so a title in front ("Biskop …",
  // "Sersjantmajor …") cannot hide the name behind it. A street that starts with a first name
  // ("… Smiths vei", "… Sundtsgate") is an address, not a person.
  const STREET = /^(?:vei|veg|gate|gata|plass|allé|torg)\b|(?:gate|gata|gaten|veien|vegen|vei|plass)$/;
  // A middle initial ("Kari W. Hansen") is part of the run.
  text = text.replace(new RegExp(`(?<![${UP}${LO}])${NAME_TOKEN}(?:[ \\t](?:${NAME_TOKEN}|[${UP}]\\.))+(?:[ \\t]+\\S+)?`, 'g'), (run) => {
    const tail = run.match(/[ \t]+(\S+)$/);
    const words = run.split(/[ \t]+/);
    const caps = tail && !/^[A-ZÆØÅÉ]/.test(tail[1]) ? words.slice(0, -1) : words;   // an initial "W." starts with a capital too
    const next = tail && caps.length < words.length ? tail[1] : '';
    const i = caps.findIndex((w, k) => k < caps.length - 1 && isFirst(w) && !NOT_NAMES.has(w));
    if (i < 0) return run;
    const name = [caps[i]];                               // contiguous: stop at the first word that is not a name
    for (const w of caps.slice(i + 1, i + 4)) { if (NOT_NAMES.has(w)) break; name.push(w); }
    if (name.length < 2 || STREET.test(name[name.length - 1]) || STREET.test(next)) return run;
    const original = name.join(' ');
    redactions.push({ kind: 'NAME', method: 'FIRST_NAME', original });
    return run.replace(original, '[navn]');
  });

  // SURNAME: a capitalised word followed by a surname at least 200 people carry (SSB table 12891) -
  // catches a name whose first name is not in table 10501. Many surnames are also place words
  // ("Berg", "Vik"), so the word before must not be a known place or NGO word ("Villa Berg").
  text = text.replace(new RegExp(`(?<![${UP}${LO}\\[])(${NAME_TOKEN})[ \\t](${NAME_TOKEN})(?![${LO}])(?![ \\t]*(?:vei|veg|gate|gata|plass)\\b)`, 'g'),
    (whole, a: string, b: string, offset: number) => {
      if (!surnames.has(b) || notPeople.has(a) || NOT_NAMES.has(a) || NOT_NAMES.has(b) || offset === 0) return whole;
      const before = text.slice(Math.max(0, offset - 2), offset);
      if (/[.!?]\s$|^\n|\n$/.test(before) && !firstNames.has(a)) return whole;   // sentence start: "Den Berg" is not a name
      redactions.push({ kind: 'NAME', method: 'SURNAME', original: whole });
      return '[navn]';
    });

  // What still looks like a person: a known first name standing alone mid-sentence, or two
  // capitalised words mid-sentence that are not on the not-a-name list.
  const suspects: string[] = [];
  for (const sentence of text.split(/(?<=[.!?:\n])\s+/)) {
    // The first word of a sentence is capitalised anyway - except on a short line, which in a
    // contact block is often just a name ("Kari W. Hansen").
    const all = sentence.split(/\s+/);
    const toks = all.length <= 6 ? all : all.slice(1);
    // A first name that opens a sentence ("Torunn tar imot penger …") is a person too - unless it is
    // one of the names that are also everyday words in that position.
    const first = (all[0] ?? '').replace(/[^A-Za-zÆØÅæøåÉéü-]/g, '');
    if (all.length > 6 && isFirst(first) && !NOT_NAMES.has(first) && !SENTENCE_WORDS.has(first)) suspects.push(`${first} ${all[1] ?? ''}`);
    toks.forEach((t, i) => {
      const w = t.replace(/[^A-Za-zÆØÅæøåÉéü-]/g, '');
      if (isFirst(w) && !NOT_NAMES.has(w)) suspects.push(w + (toks[i + 1] ? ` ${toks[i + 1]}` : ''));
    });
  }
  const word = (t: string) => t.replace(/[^A-Za-zÆØÅæøåÉéü-]/g, '');
  const cap = /^[A-ZÆØÅÉ][a-zæøåéü]+$/;
  for (const sentence of text.split(/(?<=[.!?:])\s+|\n/)) {
    const toks = sentence.split(/\s+/).map(word);
    for (let i = 1; i < toks.length - 1; i += 1) {
      const [a, b] = [toks[i], toks[i + 1]];
      if (cap.test(a) && cap.test(b) && !notPeople.has(a) && !notPeople.has(b) && !NOT_NAMES.has(a) && !NOT_NAMES.has(b)) {
        suspects.push(`${a} ${b}`);
      }
    }
  }
  return { text, redactions, needsReview: suspects.length > 0, suspects };
}
