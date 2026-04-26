import { describe, it, expect } from "vitest";
import { recordHash } from "../record_hash.js";

describe("recordHash", () => {
  it("produces a 64-char lowercase hex string", () => {
    expect(recordHash({ a: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic (same input → same hash)", () => {
    const r = { name: "Oslo", activities: ["a", "b", "c"] };
    expect(recordHash(r)).toBe(recordHash(r));
  });

  it("canonicalizes top-level key order", () => {
    expect(recordHash({ a: 1, b: 2, c: 3 })).toBe(
      recordHash({ c: 3, a: 1, b: 2 }),
    );
  });

  it("canonicalizes nested key order", () => {
    expect(recordHash({ outer: { a: 1, b: 2 } })).toBe(
      recordHash({ outer: { b: 2, a: 1 } }),
    );
  });

  it("preserves array order (arrays are not canonicalized)", () => {
    expect(recordHash({ xs: [1, 2, 3] })).not.toBe(
      recordHash({ xs: [3, 2, 1] }),
    );
  });

  it("distinguishes different content", () => {
    expect(recordHash({ a: 1 })).not.toBe(recordHash({ a: 2 }));
    expect(recordHash({ a: 1 })).not.toBe(recordHash({ b: 1 }));
  });

  it("distinguishes null from undefined", () => {
    // fast-json-stable-stringify omits undefined properties, keeps null
    expect(recordHash({ a: null })).not.toBe(recordHash({ a: undefined }));
  });

  it("distinguishes number from string", () => {
    expect(recordHash({ a: 1 })).not.toBe(recordHash({ a: "1" }));
  });

  it("does NOT normalize Unicode — NFC vs NFD produce different hashes", () => {
    // Contract (Q21): callers must NFC-normalize strings at the parser
    // boundary BEFORE building the record. recordHash itself is pure bytes.
    // This test documents the contract so a future reader doesn't assume
    // otherwise.
    //
    // Using `å` (U+00E5) which has a canonical NFD decomposition to
    // `a` (U+0061) + combining ring above (U+030A). `ø` is NOT used here
    // because it's atomic in Unicode (no canonical decomposition).
    const nfc = "\u00E5"; // "å" as a single codepoint
    const nfd = "\u0061\u030A"; // "a" + combining ring above — visually identical
    expect(nfc).not.toBe(nfd);
    expect(recordHash({ name: nfc })).not.toBe(recordHash({ name: nfd }));
  });

  it("once both sides NFC-normalized, hashes match", () => {
    const raw1 = "\u00E5"; // pre-composed
    const raw2 = "\u0061\u030A".normalize("NFC"); // decomposed, then composed
    expect(recordHash({ name: raw1 })).toBe(recordHash({ name: raw2 }));
  });
});
