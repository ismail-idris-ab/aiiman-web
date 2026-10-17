import { describe, expect, it } from "vitest";

import { parseClientEnv, parseServerEnv } from "@/lib/env-schema";
import { missingSiteConfigFields, siteConfig } from "@/site.config";

describe("parseServerEnv", () => {
  it("accepts an empty environment with every integration disabled", () => {
    const env = parseServerEnv({});
    expect(env.NODE_ENV).toBe("development");
    expect(env.BUTTONDOWN_API_KEY).toBeUndefined();
    expect(env.UPSTASH_REDIS_REST_URL).toBeUndefined();
  });

  it("treats empty strings as unset", () => {
    const env = parseServerEnv({ BUTTONDOWN_API_KEY: "", VERCEL_ENV: "" });
    expect(env.BUTTONDOWN_API_KEY).toBeUndefined();
    expect(env.VERCEL_ENV).toBeUndefined();
  });

  it("accepts a complete Upstash pair", () => {
    const env = parseServerEnv({
      UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
      UPSTASH_REDIS_REST_TOKEN: "token",
    });
    expect(env.UPSTASH_REDIS_REST_TOKEN).toBe("token");
  });

  it("rejects half an Upstash pair", () => {
    expect(() =>
      parseServerEnv({ UPSTASH_REDIS_REST_URL: "https://example.upstash.io" }),
    ).toThrow(/both UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN/);
  });

  it("rejects a non-https Upstash URL", () => {
    expect(() =>
      parseServerEnv({
        UPSTASH_REDIS_REST_URL: "http://example.upstash.io",
        UPSTASH_REDIS_REST_TOKEN: "token",
      }),
    ).toThrow(/Invalid server environment variables/);
  });

  it("rejects an unknown VERCEL_ENV", () => {
    expect(() => parseServerEnv({ VERCEL_ENV: "staging" })).toThrow();
  });
});

describe("parseClientEnv", () => {
  it("accepts an http(s) site URL", () => {
    expect(
      parseClientEnv({ NEXT_PUBLIC_SITE_URL: "http://localhost:3000" })
        .NEXT_PUBLIC_SITE_URL,
    ).toBe("http://localhost:3000");
  });

  it("rejects a non-URL", () => {
    expect(() =>
      parseClientEnv({ NEXT_PUBLIC_SITE_URL: "aiiman.dev" }),
    ).toThrow();
  });
});

describe("missingSiteConfigFields", () => {
  it("lists every unset identity field", () => {
    const missing = missingSiteConfigFields({
      ...siteConfig,
      email: null,
      socials: { ...siteConfig.socials, github: "https://github.com/example" },
    });
    expect(missing).toContain("email");
    expect(missing).not.toContain("socials.github");
    expect(missing).not.toContain("socials.x");
  });
});
