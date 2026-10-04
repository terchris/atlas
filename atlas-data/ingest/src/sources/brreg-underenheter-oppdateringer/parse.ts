/**
 * Pure logic for Brreg's underenheter change feed.
 *
 * Mirrors ../brreg-oppdateringer/parse.ts exactly — same three measured
 * properties that make a careless poller look healthy while consuming nothing
 * (page capped at 20 with a page-built `next` link; an absent, not empty,
 * `_embedded` at caught-up; a deleted sub-unit still answering HTTP 200). See
 * that file's header for the full reasoning. Verified independently against
 * the live underenheter feed 2026-10-04 — same HAL shape, same pagination
 * quirk, same five endringstype values (Ny/Endring/Sletting all observed in a
 * 100-row live sample at the current cursor), same HTTP-200 deletion stub
 * (organisasjonsnummer 920045154: respons_klasse "SlettetUnderEnhet",
 * slettedato set).
 *
 * 🔴 THE ONE REAL DIFFERENCE, and it is upstream naming, not a design choice:
 * this feed's embedded key is `oppdaterteUnderenheter` (enheter's is
 * `oppdaterteEnheter`), and its entity link is `_links.underenhet`
 * (enheter's is `_links.enhet`). Both asserted directly below rather than
 * inferred, so a future refactor that "simplifies" the two feeds into one
 * generic reader cannot silently read the wrong key and see nothing.
 */

/** One change as the feed reports it. */
export interface FeedChange {
  oppdateringsid: number;
  dato: string | null;
  organisasjonsnummer: string;
  endringstype: string;
  /** `_links.underenhet.href` — the sub-unit as it stands now. Always present in practice. */
  underenhetHref: string | null;
}

export interface FeedPage {
  changes: FeedChange[];
  /**
   * `page.totalElements` — records remaining FROM THE CURSOR ONWARD. Read from
   * here and never from id arithmetic — see brreg-oppdateringer/parse.ts's
   * header for why oppdateringsid is sparse in both feeds.
   */
  backlog: number | null;
}

/**
 * Read one feed response.
 *
 * 🔴 `_embedded` is ABSENT — not empty — once the cursor passes the newest
 * change, exactly as the enheter feed behaves (verified live 2026-10-04 at
 * oppdateringsid=900000000: body is `{_links, page}` with no `_embedded` key).
 */
export function parseFeedPage(body: unknown): FeedPage {
  if (typeof body !== "object" || body === null) {
    throw new Error("brreg underenheter feed: response was not an object");
  }
  const b = body as Record<string, unknown>;

  const page = b["page"] as Record<string, unknown> | undefined;
  const backlog = typeof page?.["totalElements"] === "number"
    ? (page["totalElements"] as number)
    : null;

  const embedded = b["_embedded"] as Record<string, unknown> | undefined;
  const raw = embedded?.["oppdaterteUnderenheter"];
  if (raw === undefined) return { changes: [], backlog };
  if (!Array.isArray(raw)) {
    throw new Error("brreg underenheter feed: _embedded.oppdaterteUnderenheter was present but not an array");
  }

  return { changes: raw.map(toChange), backlog };
}

function toChange(item: unknown, index: number): FeedChange {
  const c = item as Record<string, unknown>;
  const id = c?.["oppdateringsid"];
  const orgnr = c?.["organisasjonsnummer"];
  if (typeof id !== "number" || !Number.isFinite(id)) {
    throw new Error(`brreg underenheter feed: change ${index} has no numeric oppdateringsid`);
  }
  if (typeof orgnr !== "string" || !/^[0-9]{9}$/.test(orgnr)) {
    throw new Error(
      `brreg underenheter feed: change ${index} (oppdateringsid ${id}) has no valid organisasjonsnummer`,
    );
  }
  const endringstype = c["endringstype"];
  if (typeof endringstype !== "string" || endringstype.length === 0) {
    throw new Error(`brreg underenheter feed: change ${index} (oppdateringsid ${id}) has no endringstype`);
  }
  const links = c["_links"] as Record<string, { href?: unknown }> | undefined;
  const href = links?.["underenhet"]?.href;

  return {
    oppdateringsid: id,
    dato: typeof c["dato"] === "string" ? (c["dato"] as string) : null,
    organisasjonsnummer: orgnr,
    endringstype,
    underenhetHref: typeof href === "string" ? href : null,
  };
}

/**
 * Where the next request starts: one past the highest id in this batch. Same
 * `+1` reasoning as the enheter feed's nextCursor — `?oppdateringsid=N` returns
 * records with id ≥ N.
 */
export function nextCursor(changes: readonly FeedChange[], current: number): number {
  let highest = current - 1;
  for (const c of changes) if (c.oppdateringsid > highest) highest = c.oppdateringsid;
  return highest + 1;
}

/**
 * What a change type means for Atlas's copy. Same five values as the enheter
 * feed, same classification — verified live 2026-10-04: a 100-row sample at the
 * current cursor held Ny 51, Endring 35, Sletting 14.
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
      return "skip_unknown";
    default:
      return "skip_unknown";
  }
}

/**
 * Is this entity body Brreg's deleted-sub-unit stub rather than a live record?
 *
 * 🔴 Confirmed live 2026-10-04 on organisasjonsnummer 920045154 (`Sletting`):
 * HTTP 200, `respons_klasse: "SlettetUnderEnhet"`, `slettedato` set, ~6 keys
 * instead of the ~13 a live sub-unit carries.
 *
 * ⚠️ NOT EVERY DELETION ANSWERS THIS WAY. A `Fjernet` entity can answer HTTP
 * 410 instead — confirmed live 2026-10-04 on organisasjonsnummer 934464524,
 * body `{_links, organisasjonsnummer, slettedato}`, 3 keys, no
 * `respons_klasse` at all. index.ts's entity fetch already treats any HTTP
 * error as "no document" (doc = null) rather than throwing, so this case is
 * handled — but `looksDeleted` simply never fires for it (`looksDeleted(null)`
 * is `false`). That is fine: `classify(endringstype)` is the authoritative
 * signal for both the 200-stub and the 410 case, and does not depend on the
 * entity fetch succeeding at all. `looksDeleted` corroborates one shape of
 * deletion; its absence is not evidence a record is still live.
 */
export function looksDeleted(doc: Record<string, unknown> | null): boolean {
  if (!doc) return false;
  return doc["slettedato"] != null;
}
