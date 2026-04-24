import { describe, it, expect } from "vitest";
import { parseRobots, isAllowed } from "../robots.js";

const UA = "Atlas/0.1";

describe("parseRobots + isAllowed", () => {
  it("empty robots.txt → everything allowed", () => {
    const rules = parseRobots("example.no", "");
    expect(isAllowed(rules, "https://example.no/", UA)).toBe(true);
    expect(isAllowed(rules, "https://example.no/admin", UA)).toBe(true);
  });

  it("User-agent: * Disallow: / blocks everything", () => {
    const rules = parseRobots("example.no", "User-agent: *\nDisallow: /\n");
    expect(isAllowed(rules, "https://example.no/", UA)).toBe(false);
    expect(isAllowed(rules, "https://example.no/public/page", UA)).toBe(false);
  });

  it("blocks by path prefix", () => {
    const rules = parseRobots(
      "example.no",
      "User-agent: *\nDisallow: /admin\n",
    );
    expect(isAllowed(rules, "https://example.no/admin", UA)).toBe(false);
    expect(isAllowed(rules, "https://example.no/admin/page", UA)).toBe(false);
    expect(isAllowed(rules, "https://example.no/", UA)).toBe(true);
    expect(isAllowed(rules, "https://example.no/public", UA)).toBe(true);
  });

  it("empty Disallow: means allow all", () => {
    const rules = parseRobots("example.no", "User-agent: *\nDisallow:\n");
    expect(isAllowed(rules, "https://example.no/anything", UA)).toBe(true);
  });

  it("Allow overrides Disallow when it matches a longer prefix", () => {
    const rules = parseRobots(
      "example.no",
      "User-agent: *\nDisallow: /private\nAllow: /private/public\n",
    );
    expect(isAllowed(rules, "https://example.no/private/page", UA)).toBe(false);
    expect(isAllowed(rules, "https://example.no/private/public", UA)).toBe(true);
    expect(isAllowed(rules, "https://example.no/private/public/x", UA)).toBe(
      true,
    );
  });

  it("UA-specific block overrides wildcard", () => {
    const rules = parseRobots(
      "example.no",
      "User-agent: *\nDisallow: /\n\nUser-agent: Atlas\nDisallow: /admin\n",
    );
    // Wildcard says block everything, but Atlas has its own block saying only
    // /admin is disallowed.
    expect(isAllowed(rules, "https://example.no/public", UA)).toBe(true);
    expect(isAllowed(rules, "https://example.no/admin", UA)).toBe(false);
  });

  it("UA matching is case-insensitive", () => {
    const rules = parseRobots(
      "example.no",
      "User-agent: atlas\nDisallow: /x\n",
    );
    expect(isAllowed(rules, "https://example.no/x", "Atlas/0.1")).toBe(false);
  });

  it("ignores comments and blank lines", () => {
    const rules = parseRobots(
      "example.no",
      "# hello\n\nUser-agent: *  # trailing\nDisallow: /admin # comment\n",
    );
    expect(isAllowed(rules, "https://example.no/admin", UA)).toBe(false);
    expect(isAllowed(rules, "https://example.no/", UA)).toBe(true);
  });

  it("handles multiple user-agents in one block", () => {
    const rules = parseRobots(
      "example.no",
      "User-agent: Atlas\nUser-agent: Googlebot\nDisallow: /admin\n",
    );
    expect(isAllowed(rules, "https://example.no/admin", "Atlas/0.1")).toBe(
      false,
    );
    expect(isAllowed(rules, "https://example.no/admin", "Googlebot/2.1")).toBe(
      false,
    );
  });

  it("parses Crawl-Delay", () => {
    const rules = parseRobots(
      "example.no",
      "User-agent: Atlas\nCrawl-delay: 5\n",
    );
    const group = rules.userAgentRules.get("atlas");
    expect(group?.crawlDelay).toBe(5);
  });

  it("supports $ end-anchor in Disallow", () => {
    const rules = parseRobots(
      "example.no",
      "User-agent: *\nDisallow: /page.html$\n",
    );
    expect(isAllowed(rules, "https://example.no/page.html", UA)).toBe(false);
    expect(isAllowed(rules, "https://example.no/page.htmlx", UA)).toBe(true);
  });

  it("supports * wildcard in paths", () => {
    const rules = parseRobots(
      "example.no",
      "User-agent: *\nDisallow: /*.pdf\n",
    );
    expect(isAllowed(rules, "https://example.no/foo.pdf", UA)).toBe(false);
    expect(isAllowed(rules, "https://example.no/docs/bar.pdf", UA)).toBe(false);
    expect(isAllowed(rules, "https://example.no/foo.html", UA)).toBe(true);
  });
});
