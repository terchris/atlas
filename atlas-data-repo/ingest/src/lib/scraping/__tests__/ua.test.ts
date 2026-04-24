import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildUserAgent, MissingContactEmailError } from "../ua.js";

const ENV_KEY = "ATLAS_SCRAPE_CONTACT_EMAIL";

describe("buildUserAgent", () => {
  let original: string | undefined;

  beforeEach(() => {
    original = process.env[ENV_KEY];
    delete process.env[ENV_KEY];
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env[ENV_KEY];
    } else {
      process.env[ENV_KEY] = original;
    }
  });

  it("throws MissingContactEmailError when env is unset", () => {
    expect(() => buildUserAgent()).toThrow(MissingContactEmailError);
  });

  it("throws when env is empty string", () => {
    process.env[ENV_KEY] = "";
    expect(() => buildUserAgent()).toThrow(MissingContactEmailError);
  });

  it("throws when env is whitespace only", () => {
    process.env[ENV_KEY] = "   \t  ";
    expect(() => buildUserAgent()).toThrow(MissingContactEmailError);
  });

  it("produces the exact UA string for a valid env", () => {
    process.env[ENV_KEY] = "terje@helpers.no";
    expect(buildUserAgent()).toBe(
      "Atlas/0.1 (https://github.com/terchris/atlas; terje@helpers.no)",
    );
  });

  it("trims surrounding whitespace from the email", () => {
    process.env[ENV_KEY] = "  terje@helpers.no  ";
    expect(buildUserAgent()).toBe(
      "Atlas/0.1 (https://github.com/terchris/atlas; terje@helpers.no)",
    );
  });

  it("error message mentions the env var name and the ethical contract", () => {
    try {
      buildUserAgent();
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(MissingContactEmailError);
      expect((e as Error).message).toMatch(/ATLAS_SCRAPE_CONTACT_EMAIL/);
      expect((e as Error).message).toMatch(/anonymous/i);
    }
  });
});
