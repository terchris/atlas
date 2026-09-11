/**
 * Pure logic for Frivillighetsregisteret — the voluntary-organisation register.
 *
 * 🔴 THIS API IS THE EXACT OPPOSITE OF THE ENHETSREGISTER CHANGE FEED, AND THE
 * OPPOSITE MISTAKE IS AVAILABLE.
 *
 * Measured 2026-09-12:
 *
 *   | | oppdateringer/enheter | frivillige-organisasjoner |
 *   |---|---|---|
 *   | `page=`         | works, capped at 20 — the trap | **rejected, HTTP 400 even at page=0** |
 *   | `_links.next`   | built with `page=` — the trap   | **`searchAfter=`, the only way to walk** |
 *   | `size` max      | ≥ 10,000                        | **100** (101 → 400) |
 *   | `page` block    | present, `totalElements` usable | **absent — no backlog signal at all** |
 *
 * So `brreg-oppdateringer` must never follow `_links.next`, and this module must
 * do nothing else. A house rule of either "always follow next" or "never follow
 * next" would be wrong for exactly one of the two, which is why each module
 * states its own reason rather than inheriting one.
 *
 * ⚠️ And `lib/brreg/client.ts`'s `paginate()` helper fits neither: it increments
 * `page`, which this endpoint rejects outright.
 */

/** A Frivillighetsregisteret record, reduced to the fields Atlas types. */
export interface FrivilligOrganisasjon {
  organisasjonsnummer: string;
  /** The registrant's own ICNPO classification. The reason this register is worth a second call. */
  icnpoKategorier: unknown;
  doc: Record<string, unknown>;
}

export interface FrivilligPage {
  items: FrivilligOrganisasjon[];
  /**
   * The `_links.next` href, or null at the end of the walk.
   *
   * Unlike the change feed, following this is correct — it carries
   * `searchAfter=<last organisasjonsnummer>`, which is keyset pagination and has
   * no cap. There is no page number to construct and none is accepted.
   */
  nextHref: string | null;
}

const ORGNR = /^[0-9]{9}$/;

export function parseFrivilligPage(body: unknown): FrivilligPage {
  if (typeof body !== "object" || body === null) {
    throw new Error("frivillighetsregisteret: response was not an object");
  }
  const b = body as Record<string, unknown>;

  const links = b["_links"] as Record<string, { href?: unknown }> | undefined;
  const href = links?.["next"]?.href;
  const nextHref = typeof href === "string" ? href : null;

  const embedded = b["_embedded"] as Record<string, unknown> | undefined;
  const raw = embedded?.["frivilligeOrganisasjoner"];
  // Absent `_embedded` ends the walk, the same shape the change feed uses when
  // caught up. Written out rather than indexed into, for the same reason.
  if (raw === undefined) return { items: [], nextHref: null };
  if (!Array.isArray(raw)) {
    throw new Error(
      "frivillighetsregisteret: _embedded.frivilligeOrganisasjoner was present but not an array",
    );
  }

  return { items: raw.map(toOrganisasjon), nextHref };
}

function toOrganisasjon(item: unknown, index: number): FrivilligOrganisasjon {
  const o = item as Record<string, unknown>;
  const orgnr = o?.["organisasjonsnummer"];
  if (typeof orgnr !== "string" || !ORGNR.test(orgnr)) {
    throw new Error(
      `frivillighetsregisteret: record ${index} has no valid organisasjonsnummer`,
    );
  }
  return {
    organisasjonsnummer: orgnr,
    icnpoKategorier: o["icnpoKategorier"] ?? null,
    doc: o,
  };
}

/**
 * The register's own ICNPO code for an organisation, if it has one.
 *
 * `icnpoKategorier` is an ordered array — `rekkefoelge` 1 is the primary
 * classification. Atlas takes that one into a column and keeps the whole array
 * in `doc`, because an organisation may legitimately carry several and dropping
 * the rest would be a lossy decision made at load time.
 *
 * 🟢 This is the field that makes the register worth a second API call at all.
 * Membership does NOT need one: `registrertIFrivillighetsregisteret` is on 100%
 * of Enhetsregisteret's bulk records and true for ~72,798. Only the
 * FRR-*specific* attributes live here.
 */
export function primaryIcnpo(
  icnpoKategorier: unknown,
): { nummer: string; kategori: string } | null {
  if (!Array.isArray(icnpoKategorier) || icnpoKategorier.length === 0) return null;
  const sorted = [...icnpoKategorier]
    .filter((k): k is Record<string, unknown> => typeof k === "object" && k !== null)
    .sort((a, b) => Number(a["rekkefoelge"] ?? 99) - Number(b["rekkefoelge"] ?? 99));
  const first = sorted[0];
  if (!first) return null;
  const nummer = first["icnpoNummer"];
  const kategori = first["kategori"];
  if (typeof nummer !== "string" || typeof kategori !== "string") return null;
  return { nummer, kategori };
}
