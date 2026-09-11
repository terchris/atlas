/**
 * Pure logic for Brreg's `oppdateringer` change feed.
 *
 * Everything here is a decision the poller makes about a response body: how to
 * read it, when to stop, how to advance, and what each change type means. HTTP
 * and Postgres live in `./index.ts`.
 *
 * 🔴 Three properties of this API were measured on 2026-09-12 and each one is a
 * way to build a poller that looks healthy and consumes nothing:
 *
 *   1. `page` is capped at 20, and the HAL `_links.next` is a PAGE link — so
 *      "follow the next link" walks into HTTP 400 after 20 hops. This module
 *      advances by cursor only; `__tests__` asserts the source mentions neither.
 *   2. A caught-up response has NO `_embedded` key at all, so the natural
 *      `body._embedded.oppdaterteEnheter` throws on every healthy run.
 *   3. A deleted organisation's entity link still returns HTTP 200 with a stub
 *      body. Deletion is read from `endringstype`, never from a status code.
 */

/** One change as the feed reports it. */
export interface FeedChange {
  oppdateringsid: number;
  dato: string | null;
  organisasjonsnummer: string;
  endringstype: string;
  /** `_links.enhet.href` — the entity as it stands now. Always present in practice. */
  enhetHref: string | null;
}

export interface FeedPage {
  changes: FeedChange[];
  /**
   * `page.totalElements` — the number of records remaining FROM THE CURSOR
   * ONWARD, which is a genuine backlog depth.
   *
   * ⚠️ This was claimed, then retracted on a report that the figures were
   * inconsistent, then restored when the window was actually enumerated:
   * totalElements at 25,000,000 minus at 25,100,000 predicts 82,661 records, and
   * walking that window counts exactly 82,661. The figures only look wrong if
   * `oppdateringsid` is read as a record ordinal — it is not, ids are sparse.
   *
   * 🔴 Which is why the backlog is read from HERE and never from id arithmetic:
   * asking for id 16,417,000 returns a first record of 16,427,801, a 10,801-id
   * gap holding zero records.
   */
  backlog: number | null;
}

/**
 * Read one feed response.
 *
 * 🔴 `_embedded` is ABSENT — not empty — once the cursor passes the newest
 * change. That is the normal end of every successful run, so it is handled as
 * "no changes" rather than as a malformed body.
 */
export function parseFeedPage(body: unknown): FeedPage {
  if (typeof body !== "object" || body === null) {
    throw new Error("brreg feed: response was not an object");
  }
  const b = body as Record<string, unknown>;

  const page = b["page"] as Record<string, unknown> | undefined;
  const backlog = typeof page?.["totalElements"] === "number"
    ? (page["totalElements"] as number)
    : null;

  const embedded = b["_embedded"] as Record<string, unknown> | undefined;
  const raw = embedded?.["oppdaterteEnheter"];
  if (raw === undefined) return { changes: [], backlog };
  if (!Array.isArray(raw)) {
    throw new Error("brreg feed: _embedded.oppdaterteEnheter was present but not an array");
  }

  return { changes: raw.map(toChange), backlog };
}

function toChange(item: unknown, index: number): FeedChange {
  const c = item as Record<string, unknown>;
  const id = c?.["oppdateringsid"];
  const orgnr = c?.["organisasjonsnummer"];
  if (typeof id !== "number" || !Number.isFinite(id)) {
    throw new Error(`brreg feed: change ${index} has no numeric oppdateringsid`);
  }
  if (typeof orgnr !== "string" || !/^[0-9]{9}$/.test(orgnr)) {
    throw new Error(
      `brreg feed: change ${index} (oppdateringsid ${id}) has no valid organisasjonsnummer`,
    );
  }
  const endringstype = c["endringstype"];
  if (typeof endringstype !== "string" || endringstype.length === 0) {
    throw new Error(`brreg feed: change ${index} (oppdateringsid ${id}) has no endringstype`);
  }
  const links = c["_links"] as Record<string, { href?: unknown }> | undefined;
  const href = links?.["enhet"]?.href;

  return {
    oppdateringsid: id,
    dato: typeof c["dato"] === "string" ? (c["dato"] as string) : null,
    organisasjonsnummer: orgnr,
    endringstype,
    enhetHref: typeof href === "string" ? href : null,
  };
}

/**
 * Where the next request starts: one past the highest id in this batch.
 *
 * `?oppdateringsid=N` returns records with id **≥ N**, so re-asking with the same
 * N re-delivers the last record. `+1` is what turns that into forward progress,
 * and asking with the *unadvanced* watermark after a crash is what makes an
 * interrupted run resume without a gap.
 */
export function nextCursor(changes: readonly FeedChange[], current: number): number {
  let highest = current - 1;
  for (const c of changes) if (c.oppdateringsid > highest) highest = c.oppdateringsid;
  return highest + 1;
}

/**
 * What a change type means for Atlas's copy.
 *
 * 🔴 All five values occur. Sampling the id range on 2026-09-12:
 *
 *   cursor          1   Ukjent 500                                    2018-04-23
 *   cursor  5,000,000   Endring 500                                   2019-11-11
 *   cursor 14,000,000   Endring 494, Sletting 6                       2022-03-29
 *   cursor 16,400,000   Endring 342, Sletting 112, Fjernet 23, Ny 23  2022-12-15
 *   ?dato=2026-09-10    Endring 314, Ny 133, Sletting 53
 *
 * ⚠️ `Fjernet` did NOT appear in the 2026-09-11 daily sample, and an earlier
 * draft of the plan recorded that as "zero Fjernet — did not appear". It does
 * occur; the day sampled simply had none. A catch-up from an old watermark walks
 * straight through the era where it is common.
 *
 * ⚠️ `Ukjent` is the whole pre-2018-08 history. It is a real value, not a parse
 * failure, and it must never delete anything.
 */
export type ChangeAction = "apply" | "tombstone" | "skip_unknown";

export function classify(endringstype: string): ChangeAction {
  switch (endringstype) {
    case "Ny":
    case "Endring":
      return "apply";
    case "Sletting":
    case "Fjernet":
      return "tombstone";
    case "Ukjent":
      // Deliberately its own case rather than falling into the default. It means
      // "Brreg did not record what kind of change this was", which is not the
      // same as "Atlas does not recognise this value" — and conflating them
      // would hide a genuinely new sixth value behind 10M legitimate ones.
      return "skip_unknown";
    default:
      // A sixth value lands here: recorded, counted, surfaced, and applied to
      // nothing. Refusing to guess is the point — guessing "probably an update"
      // on an unknown type is how a poller silently applies a deletion as an
      // edit.
      return "skip_unknown";
  }
}

/**
 * Is this entity body Brreg's deleted-organisation stub rather than a live
 * record?
 *
 * 🔴 A deleted organisation answers **HTTP 200**, not 404 or 410, with ~6 keys
 * instead of ~30. Status codes cannot detect deletion here. This is a
 * corroborating check on top of `endringstype`, never a substitute for it: it
 * catches the case where the feed says `Endring` but the entity has since been
 * deleted, which would otherwise write a stub over a full record.
 */
export function looksDeleted(doc: Record<string, unknown> | null): boolean {
  if (!doc) return false;
  return doc["slettedato"] != null;
}
