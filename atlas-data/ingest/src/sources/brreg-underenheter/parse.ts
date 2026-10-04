/**
 * Streaming reader for Brreg's bulk underenheter download.
 *
 * Mirrors ../brreg-enheter-alle/parse.ts exactly — same upstream shape (one
 * pretty-printed JSON array, not NDJSON), same reasons (shadow-brreg's
 * pipe-stripping CSV conversion; the whole-file JSON.parse memory cost). See
 * that file's header for the full reasoning; this one only restates what
 * differs for the underenheter register specifically.
 *
 * Verified live 2026-10-04: GET .../underenheter/lastned with
 * `Accept: application/vnd.brreg.enhetsregisteret.underenhet.v2+gzip` answers
 * 200 with `Last-Modified` in the same non-standard Java Date.toString() shape
 * as the enheter file ("Sat Oct 03 04:30:43 CEST 2026") — snapshotFileDate below
 * is copied unchanged rather than shared, matching this repo's existing
 * convention of per-source parse.ts files (enheter-alle and oppdateringer do not
 * share this logic either, despite both being Brreg-specific).
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
            "brreg underenheter bulk file is not a JSON array — the download shape changed upstream",
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
            throw new Error("brreg underenheter bulk file: element ended without a start");
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
          `brreg underenheter bulk file: unexpected character '${chunk[i]}' at array level — ` +
            "expected an object. The upstream shape changed.",
        );
      }
    }

    if (elemStart >= 0) carry += chunk.slice(elemStart);
  }

  if (!closed) {
    throw new Error(
      "brreg underenheter bulk file ended mid-document — the download was truncated. " +
        "Treat this as a failed run; a partial register is worse than none.",
    );
  }
}

/** The subset of an Underenhet this loader reads. Everything else stays in `doc`. */
export interface BrregUnderenhetRecord {
  organisasjonsnummer: string;
  /** The upstream object, verbatim, with nothing dropped or renamed. */
  doc: Record<string, unknown>;
}

const ORGNR = /^[0-9]{9}$/;

/**
 * Parse each element and pull out the primary key. Nothing else is read, typed
 * or normalised here.
 *
 * A record without a well-formed `organisasjonsnummer` throws rather than being
 * skipped: it is the primary key, so a bad one means either a corrupted stream
 * or an upstream change, and both should stop the load.
 */
export async function* parseUnderenheter(
  elements: AsyncIterable<string>,
): AsyncGenerator<BrregUnderenhetRecord> {
  for await (const text of elements) {
    const doc = JSON.parse(text) as Record<string, unknown>;
    const orgnr = doc["organisasjonsnummer"];
    if (typeof orgnr !== "string" || !ORGNR.test(orgnr)) {
      throw new Error(
        `brreg underenhet record has no valid organisasjonsnummer: ${JSON.stringify(orgnr)} ` +
          `(record began "${text.slice(0, 120)}")`,
      );
    }
    yield { organisasjonsnummer: orgnr, doc };
  }
}

/**
 * The date of the bulk file, from the download's `Last-Modified`.
 *
 * Identical logic to brreg-enheter-alle/parse.ts's snapshotFileDate — see that
 * file for the full reasoning (Brreg sends Java's Date.toString(), which
 * Date.parse rejects; the calendar date is read verbatim rather than converted
 * through UTC). Confirmed the underenheter download sends the same non-standard
 * shape live 2026-10-04.
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
