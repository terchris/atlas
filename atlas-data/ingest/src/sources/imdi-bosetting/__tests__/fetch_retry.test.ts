import { describe, expect, it, vi } from "vitest";
import { backoffMs, fetchWithRetry } from "../fetch_retry.js";

function okResponse(): Response {
  return new Response("ok", { status: 200 });
}

describe("fetchWithRetry", () => {
  it("returns the response on first try when nothing goes wrong", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse());
    const res = await fetchWithRetry("https://example.test", {}, "label", { fetchImpl });
    expect(res.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries a thrown network exception and succeeds — the exact shape of ops-dev's failure (urb-agents #1793/#5: TypeError: fetch failed on the first call)", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(okResponse());
    const onRetry = vi.fn();
    const res = await fetchWithRetry("https://example.test", {}, "label", {
      fetchImpl,
      onRetry,
      attempts: 3,
    });
    expect(res.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("retries a 503 and succeeds — the HTTP-level sibling of the exception case", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(okResponse());
    const res = await fetchWithRetry("https://example.test", {}, "label", {
      fetchImpl,
      attempts: 3,
    });
    expect(res.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("gives up and throws the last error after exhausting every attempt — does not retry forever", async () => {
    const err = new TypeError("fetch failed");
    const fetchImpl = vi.fn().mockRejectedValue(err);
    await expect(
      fetchWithRetry("https://example.test", {}, "label", { fetchImpl, attempts: 3 }),
    ).rejects.toBe(err);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("does NOT retry a plain 404 — only 429/5xx and thrown exceptions are retryable", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("", { status: 404 }));
    const res = await fetchWithRetry("https://example.test", {}, "label", { fetchImpl });
    expect(res.status).toBe(404);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("backoffMs grows and stays within a sane jitter band at each attempt", () => {
    for (let attempt = 0; attempt < 4; attempt++) {
      const base = 500 * 2 ** attempt;
      const wait = backoffMs(attempt);
      expect(wait).toBeGreaterThanOrEqual(base);
      expect(wait).toBeLessThan(base + 250);
    }
  });
});
