import { verifyPreviewToken } from "@aiiman/shared/preview-token";
import { describe, expect, it, vi } from "vitest";
import { createSiteClient, SiteUnavailableError } from "../src/site.js";

const SECRET = "s".repeat(32);
const now = () => new Date("2026-10-22T09:00:00Z");

function client(fetch: typeof globalThis.fetch, log = vi.fn()) {
  return createSiteClient({
    url: "https://site.example",
    secret: SECRET,
    protectionBypass: "bypass",
    fetch,
    log,
    now,
  });
}

describe("revalidate", () => {
  it("posts to the site with the secret and bypass headers", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 200 }));
    expect(await client(fetch).revalidate()).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      new URL("https://site.example/api/revalidate"),
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
    const site = createSiteClient({
      url: undefined,
      secret: undefined,
      fetch,
      log,
      now,
    });
    expect(await site.revalidate()).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("api.revalidate_not_configured");
  });

  it("resolves false on errors and logs no secret", async () => {
    const log = vi.fn();
    expect(
      await client(
        async () => new Response(null, { status: 401 }),
        log,
      ).revalidate(),
    ).toBe(false);
    expect(
      await client(async () => {
        throw new TypeError(`fetch failed for ${SECRET}`);
      }, log).revalidate(),
    ).toBe(false);
    expect(JSON.stringify(log.mock.calls)).not.toContain(SECRET);
    expect(log).toHaveBeenCalledWith("api.revalidate_failed", {
      error: "TypeError",
    });
  });
});

describe("previews", () => {
  it("links to the site's draft route with a signed token", () => {
    const url = new URL(client(vi.fn()).readerUrl("post-1"));
    expect(url.origin + url.pathname).toBe("https://site.example/api/draft");
    expect(
      verifyPreviewToken(url.searchParams.get("token") ?? "", SECRET, now()),
    ).toMatchObject({ postId: "post-1" });
  });

  it("reads the search preview from the site", async () => {
    const preview = {
      title: "A post · Aiiman",
      description: "Summary",
      url: "https://site.example/a-post",
      indexed: false,
    };
    const fetch = vi.fn(async () => Response.json(preview));
    expect(await client(fetch).searchPreview("post-1")).toEqual(preview);
    const [target] = fetch.mock.calls[0] as unknown as [URL];
    expect(target.pathname).toBe("/api/draft/seo");
  });

  it("throws SiteUnavailableError when the site fails or answers oddly", async () => {
    await expect(
      client(async () => new Response(null, { status: 500 })).shareImage("p"),
    ).rejects.toBeInstanceOf(SiteUnavailableError);
    await expect(
      client(async () => Response.json({ title: 1 })).searchPreview("p"),
    ).rejects.toBeInstanceOf(SiteUnavailableError);
    const unconfigured = createSiteClient({
      url: undefined,
      secret: undefined,
      log: vi.fn(),
      now,
    });
    expect(() => unconfigured.readerUrl("p")).toThrow(SiteUnavailableError);
  });
});
