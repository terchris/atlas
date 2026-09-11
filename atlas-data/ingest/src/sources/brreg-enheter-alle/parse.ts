/**
 * Streaming reader for Brreg's bulk Enhetsregister download.
 *
 * The upstream file is **one pretty-printed JSON array** of ~1.17M objects —
 * not newline-delimited JSON. Measured on 2026-09-11 (PLAN-001 phase 1):
 * 210,132,682 bytes gzipped, 2,005,028,121 uncompressed. `JSON.parse` on the
 * whole thing would need the entire 2 GB resident plus the object graph, so
 * streaming is a requirement here, not a preference.
 *
 * 🔴 WHAT THIS FILE DELIBERATELY DOES NOT DO
 *
 * The reference implementation (terchris/shadow-brreg) converted the JSON to
 * pipe-delimited CSV and ran `awk '{gsub(/\|/,"")}1'` over the source first —
 * stripping every `|` from the data so it could not collide with the delimiter.
 * Any organisation with a pipe in its name or address was silently altered.
 * Atlas keeps the record verbatim: JSON in, jsonb out, no delimiter anywhere in
 * the path, and `__tests__/parse.test.ts` asserts that a record containing a
 * pipe, a newline and a double quote survives byte-identical.
 *
 * The scanner tracks brace/bracket depth with string and escape awareness and
 * hands each top-level element to `JSON.parse`. That split is on purpose: if the
 * scanner ever mis-frames an element, `JSON.parse` throws on a syntactically
 * broken fragment. The failure mode is a loud crash, never a silently truncated
 * record.
 */

const QUOTE = 0x22;
const BACKSLASH = 0x5c;
const OPEN_BRACE = 0x7b;
const OPEN_BRACKET = 0x5b;
const CLOSE_BRACE = 0x7d;
const CLOSE_BRACKET = 0x5d;

/** Whitespace JSON permits between tokens. */
function isJsonSpace(code: number): boolean {
  return code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d;
}

/**
 * Yield the raw text of each element of a top-level JSON array, from a stream of
 * decoded string chunks. Elements may be split across any number of chunks.
 *
 * Throws if the document is not an array, or if an element at array level is not
 * an object/array (a scalar element would mean the upstream shape changed under
 * us, and guessing is worse than stopping).
 */
export async function* streamArrayElements(
  chunks: AsyncIterable<string>,
): AsyncGenerator<string> {
  let depth = 0;
  let inString = false;
  let escaped = false;
  let closed = false;
  let carry = "";

  for await (const chunk of chunks) {
    // Inside an element when the chunk begins? Then its text starts at 0.
    let elemStart = depth >= 2 ? 0 : -1;

    for (let i = 0; i < chunk.length; i += 1) {
      const code = chunk.charCodeAt(i);

      if (inString) {
        if (escaped) escaped = false;
        else if (code === BACKSLASH) escaped = true;
        else if (code === QUOTE) inString = false;
        continue;
      }

      if (code === QUOTE) {
        inString = true;
        continue;
      }

      if (code === OPEN_BRACE || code === OPEN_BRACKET) {
        if (depth === 0 && code !== OPEN_BRACKET) {
          throw new Error(
            "brreg bulk file is not a JSON array — the download shape changed upstream",
          );
        }
        depth += 1;
        if (depth === 2) elemStart = i;
        continue;
      }

      if (code === CLOSE_BRACE || code === CLOSE_BRACKET) {
        depth -= 1;
        if (depth === 1) {
          if (elemStart < 0) {
            throw new Error("brreg bulk file: element ended without a start");
          }
          yield carry + chunk.slice(elemStart, i + 1);
          carry = "";
          elemStart = -1;
        } else if (depth === 0) {
          closed = true;
        }
        continue;
      }

      // Between elements only whitespace and commas are legal; at depth 0 only
      // whitespace, before the array opens and after it closes.
      if (depth <= 1 && !isJsonSpace(code) && code !== 0x2c) {
        throw new Error(
          `brreg bulk file: unexpected character '${chunk[i]}' at array level — ` +
            "expected an object. The upstream shape changed.",
        );
      }
    }

    if (elemStart >= 0) carry += chunk.slice(elemStart);
  }

  if (!closed) {
    throw new Error(
      "brreg bulk file ended mid-document — the download was truncated. " +
        "Treat this as a failed run; a partial register is worse than none.",
    );
  }
}

/** The subset of an Enhet this loader reads. Everything else stays in `doc`. */
export interface BrregEnhetRecord {
  organisasjonsnummer: string;
  /** The upstream object, verbatim, with nothing dropped or renamed. */
  doc: Record<string, unknown>;
}

const ORGNR = /^[0-9]{9}$/;

/**
 * Parse each element and pull out the primary key. Nothing else is read, typed
 * or normalised here — that is dbt's job (PLAN-003).
 *
 * A record without a well-formed `organisasjonsnummer` throws rather than being
 * skipped: it is the primary key, so a bad one means either a corrupted stream
 * or an upstream change, and both should stop the load.
 */
export async function* parseEnheter(
  elements: AsyncIterable<string>,
): AsyncGenerator<BrregEnhetRecord> {
  for await (const text of elements) {
    const doc = JSON.parse(text) as Record<string, unknown>;
    const orgnr = doc["organisasjonsnummer"];
    if (typeof orgnr !== "string" || !ORGNR.test(orgnr)) {
      throw new Error(
        `brreg record has no valid organisasjonsnummer: ${JSON.stringify(orgnr)} ` +
          `(record began "${text.slice(0, 120)}")`,
      );
    }
    yield { organisasjonsnummer: orgnr, doc };
  }
}

/**
 * The date of the bulk file, from the download's `Last-Modified`.
 *
 * ⚠️ Brreg does not send an RFC 7231 date. Observed 2026-09-11:
 *
 *     last-modified: Fri Sep 11 04:27:17 CEST 2026
 *
 * — Java's `Date.toString()`, which `Date.parse` rejects outright (and whose
 * `CEST` no standard parser recognises anyway). A loader that trusted
 * `Date.parse` here would record null on every single run and look like the
 * header was missing. It is not missing; it is differently shaped.
 *
 * Both accepted shapes state a calendar date, so that date is read out
 * verbatim rather than converted through UTC. Converting would be wrong at the
 * edges: a file generated at 00:30 CEST is 22:30 UTC the previous day, and the
 * file's own date is the one worth recording.
 *
 * Returns null when the header is absent or in neither shape — the load is
 * still valid, it just cannot say which day's file it came from, and a wrong
 * date would be worse than an absent one.
 */
const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

/** `Thu, 11 Sep 2026 03:14:00 GMT` — RFC 7231, what a well-behaved server sends. */
const RFC_7231 = /^[A-Za-z]{3},\s+(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})\b/;
/** `Fri Sep 11 04:27:17 CEST 2026` — Java Date.toString(), what Brreg sends. */
const JAVA_DATE = /^[A-Za-z]{3}\s+([A-Za-z]{3})[a-z]*\s+(\d{1,2})\s+\d{2}:\d{2}:\d{2}\s+\S+\s+(\d{4})\b/;

export function snapshotFileDate(lastModified: string | null): string | null {
  if (!lastModified) return null;

  const rfc = RFC_7231.exec(lastModified);
  if (rfc) return isoDate(rfc[3]!, rfc[2]!, rfc[1]!);

  const java = JAVA_DATE.exec(lastModified);
  if (java) return isoDate(java[3]!, java[1]!, java[2]!);

  return null;
}

function isoDate(year: string, monthName: string, day: string): string | null {
  const month = MONTHS[monthName.toLowerCase()];
  if (!month) return null;
  return `${year}-${month}-${day.padStart(2, "0")}`;
}
