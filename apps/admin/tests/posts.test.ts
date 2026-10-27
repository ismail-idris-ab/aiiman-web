import { textToDoc } from "@aiiman/shared";
import { describe, expect, it, vi } from "vitest";
import {
  createPost,
  listPosts,
  listRevisions,
  publishPost,
  restoreRevision,
  slugify,
  updatePost,
} from "../src/posts";

const post = {
  id: "p1",
  slug: "a-post",
  title: "A post from the admin",
  summary: "Summary",
  body: textToDoc("Hello."),
  type: "essay",
  tags: ["web"],
  lang: "en",
  noindex: false,
  status: "draft",
  authorId: "u1",
  updatedAt: "2026-10-22T09:00:00.000Z",
  publishedAt: null,
  version: 3,
};

const input = {
  title: post.title,
  slug: post.slug,
  summary: post.summary,
  body: post.body,
  type: "essay" as const,
  tags: ["web"],
  lang: "en" as const,
  noindex: false,
};

const respond = (body: unknown, status = 200) =>
  vi.fn(async () => Response.json(body, { status })) as unknown as typeof fetch;

describe("slugify", () => {
  it.each([
    ["My First Post!", "my-first-post"],
    ["  Ɗan Kano: café & code ", "dan-kano-cafe-code"],
    ["Ƙasar Ɓauna da ƴaƴa", "kasar-bauna-da-yaya"],
    ["Muʼazu’s notes", "muazus-notes"],
    ["---", ""],
  ])("%s → %s", (title, slug) => {
    expect(slugify(title)).toBe(slug);
  });

  it("caps at 100 characters without a trailing hyphen", () => {
    const slug = slugify(`${"a".repeat(99)} b`);
    expect(slug.length).toBeLessThanOrEqual(100);
    expect(slug.endsWith("-")).toBe(false);
  });
});

describe("post requests", () => {
  it("creates with a JSON body", async () => {
    const fetcher = respond({ post }, 201);
    expect(await createPost(input, {}, fetcher)).toEqual({
      ok: true,
      post,
      issues: {},
      unsaved: {},
    });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/posts",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(input),
        headers: { "content-type": "application/json" },
      }),
    );
  });

  it("returns field errors from the server", async () => {
    const result = await updatePost(
      "p1",
      3,
      input,
      {},
      respond(
        {
          error: "Check the highlighted fields",
          fields: { title: "Title needs at least 10 characters", n: 1 },
        },
        400,
      ),
    );
    expect(result).toEqual({
      ok: false,
      error: "Check the highlighted fields",
      fields: { title: "Title needs at least 10 characters" },
    });
  });

  it("passes the revalidation result through on publish", async () => {
    const published = { ...post, status: "published" };
    expect(
      await publishPost("p1", respond({ post: published, revalidated: false })),
    ).toEqual({
      ok: true,
      post: published,
      issues: {},
      unsaved: {},
      revalidated: false,
    });
  });

  it("reports a network failure plainly", async () => {
    const failing = (async () => {
      throw new TypeError("offline");
    }) as typeof fetch;
    expect(await publishPost("p1", failing)).toEqual({
      ok: false,
      error: "Couldn't reach the server. Check your connection.",
      fields: {},
      retry: true,
    });
  });

  it("sends the version an edit was made on, and marks autosaves", async () => {
    const fetcher = respond({ post, issues: { summary: "Too short" } });
    expect(
      await updatePost(
        "p1",
        3,
        input,
        { autosave: true, keepalive: true },
        fetcher,
      ),
    ).toEqual({
      ok: true,
      post,
      issues: { summary: "Too short" },
      unsaved: {},
    });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/posts/p1?autosave=1",
      expect.objectContaining({
        method: "PUT",
        keepalive: true,
        headers: { "content-type": "application/json", "if-match": '"3"' },
      }),
    );
  });

  it("returns the current post when someone saved first", async () => {
    const current = { ...post, title: "Saved in another tab", version: 4 };
    const result = await updatePost(
      "p1",
      3,
      input,
      {},
      respond({ error: "Saved somewhere else", post: current }, 412),
    );
    expect(result).toEqual({
      ok: false,
      error: "Saved somewhere else",
      fields: {},
      conflict: current,
    });
  });

  it("restores a revision on top of the current version", async () => {
    const fetcher = respond({
      post,
      issues: {},
      unsaved: {},
      revalidated: false,
      restoredFrom: "2026-10-26T09:00:00.000Z",
    });
    expect(await restoreRevision("p1", "r1", 3, fetcher)).toMatchObject({
      ok: true,
      restoredFrom: "2026-10-26T09:00:00.000Z",
    });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/posts/p1/revisions/r1/restore",
      expect.objectContaining({
        method: "POST",
        headers: { "if-match": '"3"' },
      }),
    );
  });

  it("lists only well-formed revisions", async () => {
    const revision = {
      id: "r1",
      version: 3,
      kind: "autosave",
      savedAt: "2026-10-26T09:00:00.000Z",
      savedBy: "Ismail",
      title: "A post",
      words: 2,
      excerpt: "Hello.",
    };
    expect(
      await listRevisions("p1", respond({ revisions: [revision, { id: 2 }] })),
    ).toEqual([revision]);
  });

  it("lists only well-formed posts", async () => {
    expect(await listPosts(respond({ posts: [post, { id: 1 }] }))).toEqual([
      post,
    ]);
    expect(await listPosts(respond({ error: "Not signed in" }, 401))).toBe(
      null,
    );
  });
});
