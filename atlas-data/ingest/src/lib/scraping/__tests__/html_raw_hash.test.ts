import { describe, it, expect } from "vitest";
import { htmlRawHash, canonicalizeHtmlBody } from "../html_raw_hash.js";

describe("htmlRawHash", () => {
  it("produces a 64-char lowercase hex string", () => {
    expect(htmlRawHash("<html></html>")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic", () => {
    const html = "<html><body>hello</body></html>";
    expect(htmlRawHash(html)).toBe(htmlRawHash(html));
  });

  it("different body content → different hash", () => {
    expect(htmlRawHash("<body>a</body>")).not.toBe(htmlRawHash("<body>b</body>"));
  });
});

describe("canonicalizeHtmlBody", () => {
  it("strips <head>…</head>", () => {
    const a = "<html><head><title>A</title></head><body>x</body></html>";
    const b = "<html><head><title>B</title></head><body>x</body></html>";
    expect(canonicalizeHtmlBody(a)).toBe(canonicalizeHtmlBody(b));
  });

  it("strips <head> regardless of attributes", () => {
    const a = '<html><head lang="no"><meta /></head><body>x</body></html>';
    expect(canonicalizeHtmlBody(a)).not.toMatch(/head/i);
  });

  it("strips nonce attributes (double-quoted)", () => {
    const a = '<script nonce="abc123">s</script><body>x</body>';
    const b = '<script nonce="xyz789">s</script><body>x</body>';
    expect(canonicalizeHtmlBody(a)).toBe(canonicalizeHtmlBody(b));
  });

  it("strips nonce attributes (single-quoted)", () => {
    const a = "<script nonce='abc'>s</script><body>x</body>";
    const b = "<script nonce='xyz'>s</script><body>x</body>";
    expect(canonicalizeHtmlBody(a)).toBe(canonicalizeHtmlBody(b));
  });

  it("strips CSRF meta tags", () => {
    const a = '<meta name="csrf-token" content="abc" /><body>x</body>';
    const b = '<meta name="csrf-token" content="xyz" /><body>x</body>';
    expect(canonicalizeHtmlBody(a)).toBe(canonicalizeHtmlBody(b));
  });

  it("collapses whitespace runs between tokens", () => {
    // Canonicalizer collapses any run of whitespace to a single space; it
    // does not strip whitespace adjacent to tag boundaries. Both inputs
    // below differ only in the number of spaces between "hello" and "world".
    const a = "<body>hello    world</body>";
    const b = "<body>hello world</body>";
    expect(canonicalizeHtmlBody(a)).toBe(canonicalizeHtmlBody(b));
  });

  it("collapses newlines and tabs too", () => {
    const a = "<body>hello\n\n\tworld</body>";
    const b = "<body>hello world</body>";
    expect(canonicalizeHtmlBody(a)).toBe(canonicalizeHtmlBody(b));
  });

  it("body difference survives canonicalization", () => {
    expect(canonicalizeHtmlBody("<body>a</body>")).not.toBe(
      canonicalizeHtmlBody("<body>b</body>"),
    );
  });
});
