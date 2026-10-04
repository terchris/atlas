/**
 * file: ingest/src/lib/text.ts
 * description: Norwegian text normalisation. Every trap here cost real debugging time.
 */

/**
 * Ø, Æ and Å do NOT decompose under Unicode NFD. Normalising 'RØDE KORS' without mapping
 * them first yields 'RDE KORS', so a pattern for 'RODE KORS' matches ZERO of 383 real
 * units — silently, with no error. Map the letters BEFORE any Unicode normalisation.
 */
const NORWEGIAN: Record<string, string> = {
  'Ø': 'O', 'ø': 'o', 'Æ': 'AE', 'æ': 'ae', 'Å': 'A', 'å': 'a',
  'Ö': 'O', 'ö': 'o', 'Ä': 'A', 'ä': 'a',
};

export function foldNorwegian(s: string): string {
  return (s ?? '').replace(/[ØøÆæÅåÖöÄä]/g, (c) => NORWEGIAN[c]);
}

/** Upper-case, ASCII-folded, punctuation collapsed — for name matching. */
export function normaliseName(s: string): string {
  return foldNorwegian(s ?? '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

export function slugify(s: string): string {
  return foldNorwegian(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Strip markup and collapse whitespace. */
export function stripHtml(s: string): string {
  return decodeEntities((s ?? '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', aring: 'å',
  oslash: 'ø', aelig: 'æ', Aring: 'Å', Oslash: 'Ø', AElig: 'Æ', shy: '',
  // Typographic entities. WordPress emits these constantly — an undecoded '&ndash;' in a
  // published description is visible to every consumer of the data.
  ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»',
  lsquo: '\u2018', rsquo: '\u2019', ldquo: '\u201C', rdquo: '\u201D',
  eacute: 'é', egrave: 'è', uuml: 'ü', ouml: 'ö', auml: 'ä', deg: '°',
};

export function decodeEntities(s: string): string {
  return (s ?? '')
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&(\w+);/g, (m, n) => ENTITIES[n] ?? m);
}

/**
 * Norwegian organisations publish in both written standards. A text classifier tuned to
 * bokmål mishandles nynorsk, so record which this is rather than assuming.
 */
export function detectLanguage(text: string): 'NB' | 'NN' | 'EN' | 'UNKNOWN' {
  const low = ` ${(text ?? '').toLowerCase().replace(/[^\p{L}\s]+/gu, ' ')} `;
  const count = (words: string[]) =>
    words.reduce((n, w) => n + (low.split(` ${w} `).length - 1), 0);

  // The indefinite articles are the discriminators that actually appear in every other
  // sentence: bokmål 'en'/'et' against nynorsk 'ein'/'eit'. Without them the detector fell
  // back to five rarer markers and returned UNKNOWN for plain bokmål like 'Vi er et åpent
  // og inkluderende fellesskap' — which is most short service descriptions.
  //
  // Words shared between the two standards ('vi', 'og', 'eller') are deliberately absent:
  // they raise both scores equally and discriminate nothing.
  const nn = count(['ein', 'eit', 'ikkje', 'vere', 'dykk', 'berre', 'korleis', 'eg',
                    'kva', 'noko', 'fekk', 'mykje', 'eigen', 'sjølv']);
  const nb = count(['en', 'et', 'ikke', 'være', 'dere', 'bare', 'hvordan', 'jeg',
                    'hva', 'noen', 'fikk', 'mye', 'egen', 'selv']);
  // ⚠️ English markers must be words Norwegian does NOT use. 'for' is identical in both
  // languages and is the reason an earlier version read 'Vi sørger for en pute å hvile
  // hodet på' — four Norwegian 'for's — as English.
  const en = count(['the', 'and', 'of', 'with', 'you', 'are', 'is', 'was', 'that',
                    'this', 'our', 'have', 'will', 'from', 'they']);

  // English needs a clear margin: one stray loanword in a short Norwegian line should not
  // flip the verdict.
  if (en >= 2 && en > nb + nn) return 'EN';
  if (nn > nb) return 'NN';
  if (nb > 0) return 'NB';
  return 'UNKNOWN';
}
