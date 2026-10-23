import { describe, expect, it, vi } from "vitest";
import { createSiteRevalidator } from "../src/revalidate.js";

const SECRET = "s".repeat(32);

describe("createSiteRevalidator", () => {
  it("posts to the site with the secret and bypass headers", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 200 }));
    const revalidate = createSiteRevalidator({
      url: "https://site.example/api/revalidate",
      secret: SECRET,
      protectionBypass: "bypass",
      fetch,
      log: vi.fn(),
    });
    expect(await revalidate()).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      "https://site.example/api/revalidate",
      expect.objectContaining({
        method: "POST",
        headers: {
          authorization: `Bearer ${SECRET}`,
          "x-vercel-protection-bypass": "bypass",
        },
      }),
    );
  });

  it("resolves false when not configured", async () => {
    const fetch = vi.fn();
    const log = vi.fn();
    const revalidate = createSiteRevalidator({
      url: undefined,
      secret: undefined,
      fetch,
      log,
    });
    expect(await revalidate()).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("api.revalidate_not_configured");
  });

  it("resolves false on errors and logs no secret", async () => {
    const log = vi.fn();
    const failing = createSiteRevalidator({
      url: "https://site.example/api/revalidate",
      secret: SECRET,
      fetch: async () => new Response(null, { status: 401 }),
      log,
    });
    expect(await failing()).toBe(false);

    const throwing = createSiteRevalidator({
      url: "https://site.example/api/revalidate",
      secret: SECRET,
      fetch: async () => {
        throw new TypeError(`fetch failed for ${SECRET}`);
      },
      log,
    });
    expect(await throwing()).toBe(false);
    expect(JSON.stringify(log.mock.calls)).not.toContain(SECRET);
    expect(log).toHaveBeenCalledWith("api.revalidate_failed", {
      error: "TypeError",
    });
  });
});
