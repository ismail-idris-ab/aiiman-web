import { textToDoc, type PublicPost } from "@aiiman/shared";
import { describe, expect, it, vi } from "vitest";

import {
  contentApiUrlFor,
  fetchPublishedPosts,
  mergeAdminPosts,
  postToEntry,
} from "@/lib/content/api-source";
import { createContentQueries } from "@/lib/content/queries";

const post: PublicPost = {
  slug: "written-in-the-admin",
  title: "Written in the admin",
  summary:
    "A summary long enough to pass the fifty character minimum for posts.",
  type: "tutorial",
  tags: ["web", "nigeria"],
  lang: "ha",
  date: "2026-10-22",
  featured: 3,
  noindex: false,
  publishedAt: "2026-10-21T23:30:00.000Z",
  updatedAt: "2026-10-21T23:30:00.000Z",
  authorName: "Ismail Idris",
  body: textToDoc("First paragraph here.\n\nSecond one."),
};

describe("contentApiUrlFor", () => {
  const url = "https://admin.example";

  it("never reads the API in production until switch-over", () => {
    expect(
      contentApiUrlFor({ VERCEL_ENV: "production", CONTENT_API_URL: url }),
    ).toBeUndefined();
  });

  it("reads the API on previews and local builds when configured", () => {
    expect(
      contentApiUrlFor({ VERCEL_ENV: "preview", CONTENT_API_URL: url }),
    ).toBe(url);
    expect(contentApiUrlFor({ CONTENT_API_URL: url })).toBe(url);
    expect(contentApiUrlFor({ VERCEL_ENV: "preview" })).toBeUndefined();
  });
});

describe("postToEntry", () => {
  it("maps a published post onto an Entry", () => {
    expect(postToEntry(post)).toMatchObject({
      kind: "entry",
      slug: "written-in-the-admin",
      url: "/written-in-the-admin",
      type: "tutorial",
      tags: ["web", "nigeria"],
      lang: "ha",
      featured: 3,
      date: "2026-10-22T00:00:00.000Z",
      updated: undefined,
      canonical: undefined,
      noindex: false,
      draft: false,
      raw: "First paragraph here.\n\nSecond one.",
      plainText: "First paragraph here.\n\nSecond one.",
      wordCount: 5,
      readingTime: 1,
      doc: post.body,
    });
  });

  it("carries the updated date, canonical and noindex", () => {
    expect(
      postToEntry({
        ...post,
        updated: "2026-10-25",
        canonical: "https://example.com/original",
        noindex: true,
      }),
    ).toMatchObject({
      updated: "2026-10-25T00:00:00.000Z",
      canonical: "https://example.com/original",
      noindex: true,
    });
  });

  it("marks a preview of an unpublished post as a draft", () => {
    expect(postToEntry(post, { draft: true }).draft).toBe(true);
  });

  it("is visible to published-mode queries", () => {
    const content = createContentQueries(
      { entries: [postToEntry(post)], links: [], projects: [], pages: [] },
      {
        mode: "published",
        now: new Date("2026-10-22T12:00:00Z"),
        timeZone: "Africa/Lagos",
      },
    );
    expect(content.getEntry("written-in-the-admin")?.title).toBe(post.title);
    expect(content.getByTag("nigeria")).toHaveLength(1);
  });
});

describe("mergeAdminPosts", () => {
  const admin = postToEntry(post);
  const mdx = { ...admin, title: "Old MDX title", doc: undefined };

  it("lets an admin post replace the MDX Entry with its slug", () => {
    const other = { ...mdx, slug: "other", featured: undefined };
    const { entries } = mergeAdminPosts({ entries: [mdx, other], links: [] }, [
      admin,
    ]);
    expect(entries.map((entry) => [entry.slug, entry.title])).toEqual([
      ["other", "Old MDX title"],
      ["written-in-the-admin", post.title],
    ]);
  });

  it("gives an admin post's featured position precedence", () => {
    const entry = { ...mdx, slug: "mdx-entry", featured: 3 };
    const keeps = { ...mdx, slug: "keeps-its-spot", featured: 4 };
    const link = { slug: "a-link", featured: 3 };
    const merged = mergeAdminPosts({ entries: [entry, keeps], links: [link] }, [
      admin,
    ]);
    expect(merged.entries.map((e) => [e.slug, e.featured])).toEqual([
      ["mdx-entry", undefined],
      ["keeps-its-spot", 4],
      ["written-in-the-admin", 3],
    ]);
    expect(merged.links).toEqual([{ slug: "a-link", featured: undefined }]);
  });
});

describe("fetchPublishedPosts", () => {
  it("requests the public endpoint and validates the response", async () => {
    const fetcher = vi.fn(async () => Response.json({ posts: [post] }));
    const posts = await fetchPublishedPosts("https://admin.example", fetcher);
    expect(posts).toEqual([post]);
    expect(fetcher).toHaveBeenCalledWith(
      new URL("https://admin.example/api/public/posts"),
    );
  });

  it("re-normalises bodies, dropping anything outside the allowlist", async () => {
    const bad = {
      ...post,
      body: {
        type: "doc",
        content: [
          { type: "script", content: [{ type: "text", text: "alert(1)" }] },
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "x",
                marks: [
                  { type: "link", attrs: { href: "javascript:alert(1)" } },
                ],
              },
            ],
          },
        ],
      },
    };
    const [received] = await fetchPublishedPosts(
      "https://admin.example",
      async () => Response.json({ posts: [bad] }),
    );
    expect(received?.body).toEqual({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "x" }] }],
    });
  });

  it("rejects responses of the wrong shape", async () => {
    await expect(
      fetchPublishedPosts("https://admin.example", async () =>
        Response.json({ posts: [{ slug: 1 }] }),
      ),
    ).rejects.toThrow();
  });

  it("fails loudly when the API is down", async () => {
    await expect(
      fetchPublishedPosts(
        "https://admin.example",
        async () => new Response(null, { status: 503 }),
      ),
    ).rejects.toThrow("Content API answered 503");
  });
});
