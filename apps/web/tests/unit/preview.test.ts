import { CONTENT_TIME_ZONE, textToDoc, type PreviewPost } from "@aiiman/shared";
import { describe, expect, it, vi } from "vitest";

import { fetchPreviewPost, postToEntry } from "@/lib/content/api-source";
import { entrySearchPreview, TITLE_TEMPLATE } from "@/lib/seo/metadata";
import { siteConfig } from "@/site.config";

const post: PreviewPost = {
  slug: "a-draft-post",
  title: "A draft post from the admin",
  summary:
    "A summary long enough to pass the fifty character minimum for posts.",
  type: "note",
  tags: ["web"],
  lang: "en",
  date: "2026-10-22",
  noindex: false,
  publishedAt: "2026-10-22T09:00:00.000Z",
  updatedAt: "2026-10-22T09:00:00.000Z",
  authorName: "Ismail Idris",
  body: textToDoc("Hello."),
  status: "draft",
};

describe("site and API agree on calendar dates", () => {
  it("uses the same time zone", () => {
    expect(siteConfig.timeZone).toBe(CONTENT_TIME_ZONE);
  });
});

describe("entrySearchPreview", () => {
  const siteUrl = "https://aiiman.dev";

  it("uses the layout's title template and the page URL", () => {
    expect(entrySearchPreview(siteUrl, postToEntry(post))).toEqual({
      title: TITLE_TEMPLATE.replace("%s", post.title),
      description: post.summary,
      url: "https://aiiman.dev/a-draft-post",
      indexed: true,
    });
    expect(TITLE_TEMPLATE).toBe(`%s · ${siteConfig.name}`);
  });

  it("shows the canonical URL and noindex", () => {
    const entry = postToEntry({
      ...post,
      canonical: "https://example.com/original",
      noindex: true,
    });
    expect(entrySearchPreview(siteUrl, entry)).toMatchObject({
      url: "https://example.com/original",
      indexed: false,
    });
  });
});

describe("fetchPreviewPost", () => {
  it("sends the secret, skips the cache and validates the post", async () => {
    const fetcher = vi.fn(async () => Response.json({ post }));
    expect(
      await fetchPreviewPost("https://admin.example", "p/1", "secret", fetcher),
    ).toEqual(post);
    expect(fetcher).toHaveBeenCalledWith(
      new URL("https://admin.example/api/preview/posts/p%2F1"),
      { headers: { authorization: "Bearer secret" }, cache: "no-store" },
    );
  });

  it("returns null for a missing post and throws on other failures", async () => {
    expect(
      await fetchPreviewPost(
        "https://admin.example",
        "p",
        "s",
        async () => new Response(null, { status: 404 }),
      ),
    ).toBeNull();
    await expect(
      fetchPreviewPost(
        "https://admin.example",
        "p",
        "s",
        async () => new Response(null, { status: 401 }),
      ),
    ).rejects.toThrow("Content API answered 401");
  });
});
