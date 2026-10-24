import { textToDoc, type PublicPost } from "@aiiman/shared";
import { describe, expect, it, vi } from "vitest";

import {
  contentApiUrlFor,
  fetchPublishedPosts,
  mergeEntries,
  postToEntry,
} from "@/lib/content/api-source";
import { createContentQueries } from "@/lib/content/queries";

const post: PublicPost = {
  slug: "written-in-the-admin",
  title: "Written in the admin",
  summary:
    "A summary long enough to pass the fifty character minimum for posts.",
  // 23:30 UTC is already the next day in WAT.
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
    const entry = postToEntry(post, "Africa/Lagos");
    expect(entry).toMatchObject({
      kind: "entry",
      slug: "written-in-the-admin",
      url: "/written-in-the-admin",
      date: "2026-10-22T00:00:00.000Z",
      updated: undefined,
      draft: false,
      raw: "First paragraph here.\n\nSecond one.",
      plainText: "First paragraph here.\n\nSecond one.",
      wordCount: 5,
      readingTime: 1,
      doc: post.body,
    });
  });

  it("shows an updated date only from a later day", () => {
    const entry = postToEntry(
      { ...post, updatedAt: "2026-10-25T10:00:00.000Z" },
      "Africa/Lagos",
    );
    expect(entry.updated).toBe("2026-10-25T00:00:00.000Z");
  });

  it("is visible to published-mode queries", () => {
    const content = createContentQueries(
      {
        entries: [postToEntry(post, "Africa/Lagos")],
        links: [],
        projects: [],
        pages: [],
      },
      {
        mode: "published",
        now: new Date("2026-10-22T12:00:00Z"),
        timeZone: "Africa/Lagos",
      },
    );
    expect(content.getEntry("written-in-the-admin")?.title).toBe(post.title);
  });
});

describe("mergeEntries", () => {
  it("lets an admin post replace the MDX Entry with its slug", () => {
    const admin = postToEntry(post, "Africa/Lagos");
    const mdx = { ...admin, title: "Old MDX title", doc: undefined };
    const other = { ...mdx, slug: "other" };
    const merged = mergeEntries([mdx, other], [admin]);
    expect(merged.map((entry) => [entry.slug, entry.title])).toEqual([
      ["other", "Old MDX title"],
      ["written-in-the-admin", post.title],
    ]);
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

  it("rejects bodies outside the allowlist", async () => {
    const bad = {
      ...post,
      body: { type: "doc", content: [{ type: "script" }] },
    };
    await expect(
      fetchPublishedPosts("https://admin.example", async () =>
        Response.json({ posts: [bad] }),
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
