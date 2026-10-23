import { textToDoc } from "@aiiman/shared";
import { describe, expect, it, vi } from "vitest";
import {
  createPost,
  listPosts,
  publishPost,
  slugify,
  updatePost,
} from "../src/posts";

const post = {
  id: "p1",
  slug: "a-post",
  title: "A post from the admin",
  summary: "Summary",
  body: textToDoc("Hello."),
  status: "draft",
  authorId: "u1",
  updatedAt: "2026-10-22T09:00:00.000Z",
  publishedAt: null,
};

const input = {
  title: post.title,
  slug: post.slug,
  summary: post.summary,
  body: post.body,
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
    expect(await createPost(input, fetcher)).toEqual({ ok: true, post });
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
      input,
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
    ).toEqual({ ok: true, post: published, revalidated: false });
  });

  it("reports a network failure plainly", async () => {
    const failing = (async () => {
      throw new TypeError("offline");
    }) as typeof fetch;
    expect(await publishPost("p1", failing)).toEqual({
      ok: false,
      error: "Couldn't reach the server. Check your connection.",
      fields: {},
    });
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
