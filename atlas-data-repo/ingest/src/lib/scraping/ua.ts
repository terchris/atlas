/**
 * User-Agent builder for Atlas scrapers.
 *
 * The UA includes a contact email from ATLAS_SCRAPE_CONTACT_EMAIL so site
 * operators can reach us if our scrapes cause problems. Running without the
 * env var is a hard failure per INVESTIGATE-ngo-scraping-infrastructure §D.1
 * — anonymous scrapes breach the ethical contract declared in that doc.
 *
 * Version and repo URL are hard-coded; only the contact is env-driven.
 */

const VERSION = "0.1";
const REPO = "https://github.com/terchris/atlas";

export class MissingContactEmailError extends Error {
  constructor() {
    super(
      "ATLAS_SCRAPE_CONTACT_EMAIL is not set. Atlas scrapers refuse to run " +
        "anonymously — anonymous scrapes breach the ethical contract in " +
        "INVESTIGATE-ngo-scraping-infrastructure §D.1. Set " +
        "ATLAS_SCRAPE_CONTACT_EMAIL in the ingest environment (typically " +
        "atlas-data-repo/ingest/.env).",
    );
    this.name = "MissingContactEmailError";
  }
}

/**
 * Build the User-Agent string. Throws `MissingContactEmailError` if
 * `ATLAS_SCRAPE_CONTACT_EMAIL` is unset, empty, or whitespace.
 */
export function buildUserAgent(): string {
  const raw = process.env.ATLAS_SCRAPE_CONTACT_EMAIL;
  const email = raw?.trim();
  if (!email) {
    throw new MissingContactEmailError();
  }
  return `Atlas/${VERSION} (${REPO}; ${email})`;
}
