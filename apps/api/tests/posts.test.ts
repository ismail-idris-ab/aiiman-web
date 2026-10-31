import { textToDoc, type Role } from "@aiiman/shared";
import { MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createApp } from "../src/app.js";
import { hashToken } from "../src/auth/tokens.js";
import { SESSION_COOKIE } from "../src/http/cookies.js";
import {
  createMongoStores,
  resetIndexCacheForTests,
  type Stores,
} from "../src/store.js";
import { request, testDeps, testSite } from "./helpers.js";

let mongod: MongoMemoryServer;
let client: MongoClient;
let stores: Stores;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  client = await MongoClient.connect(mongod.getUri());
}, 300_000);

afterAll(async () => {
  await client?.close();
  await mongod?.stop();
});

const USERS: Record<string, Role> = {
  admin: "admin",
  editor: "editor",
  author: "author",
  "other-author": "author",
};

beforeEach(async () => {
  resetIndexCacheForTests();
  stores = createMongoStores(client.db(`test-${crypto.randomUUID()}`));
  for (const [id, role] of Object.entries(USERS)) {
    await stores.users.insert({
      id,
      email: `${id}@example.com`,
      name: `Name of ${id}`,
      role,
      status: "active",
      passwordHash: "unused",
      createdAt: new Date("2026-10-22T00:00:00Z"),
    });
    await stores.sessions.insert({
      tokenHash: hashToken(`token-${id}`),
      userId: id,
      createdAt: new Date(),
      // Far ahead: some tests move the clock forward.
      expiresAt: new Date("2100-01-01T00:00:00Z"),
    });
  }
});

const as = (userId: string) => `${SESSION_COOKIE}=token-${userId}`;

function app(overrides: Parameters<typeof testDeps>[0] = {}) {
  return createApp(testDeps({ getStores: async () => stores, ...overrides }));
}

const input = (overrides: Record<string, unknown> = {}) => ({
  title: "Written in the admin",
  summary:
    "A summary long enough to pass the fifty character minimum for posts.",
  slug: "written-in-the-admin",
  type: "essay",
  tags: ["web"],
  lang: "en",
  noindex: false,
  body: textToDoc("First paragraph.\n\nSecond paragraph."),
  ...overrides,
});

async function createPost(
  a: ReturnType<typeof app>,
  userId = "admin",
  overrides: Record<string, unknown> = {},
): Promise<{ id: string }> {
  const res = await request(a, "/api/posts", {
    method: "POST",
    body: input(overrides),
    cookie: as(userId),
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as { post: { id: string } }).post;
}

/** An edit made on the post's current version. */
async function edit(
  a: ReturnType<typeof app>,
  id: string,
  overrides: Record<string, unknown>,
  userId = "admin",
) {
  const current = await request(a, `/api/posts/${id}`, { cookie: as("admin") });
  const { post } = (await current.json()) as { post: { version: number } };
  return request(a, `/api/posts/${id}`, {
    method: "PUT",
    body: input(overrides),
    cookie: as(userId),
    headers: { "if-match": `"${post.version}"` },
  });
}

const publish = (a: ReturnType<typeof app>, id: string, userId = "admin") =>
  request(a, `/api/posts/${id}/publish`, {
    method: "POST",
    cookie: as(userId),
  });

describe("/api/posts", () => {
  it("requires a session", async () => {
    const res = await request(app(), "/api/posts");
    expect(res.status).toBe(401);
  });

  it("creates a draft owned by the signed-in user", async () => {
    const a = app();
    const { id } = await createPost(a, "author");
    const res = await request(a, `/api/posts/${id}`, { cookie: as("author") });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toMatchObject({
      post: { id, status: "draft", authorId: "author", publishedAt: null },
    });
  });

  it("saves an incomplete draft and names what it needs to go live", async () => {
    const res = await request(app(), "/api/posts", {
      method: "POST",
      body: input({ title: "Short", slug: "about" }),
      cookie: as("admin"),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { issues: Record<string, string> };
    expect(Object.keys(body.issues).sort()).toEqual(["slug", "title"]);
  });

  it("rejects input with the wrong shape", async () => {
    const res = await request(app(), "/api/posts", {
      method: "POST",
      body: input({ type: "poem" }),
      cookie: as("admin"),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { fields: Record<string, string> };
    expect(Object.keys(body.fields)).toEqual(["type"]);
  });

  it("saves a draft without a slug another post uses, and says so", async () => {
    const a = app();
    await createPost(a);
    const res = await request(a, "/api/posts", {
      method: "POST",
      body: input(),
      cookie: as("editor"),
    });
    expect(res.status).toBe(201);
    const created = (await res.json()) as {
      post: { id: string; slug: string; title: string };
      unsaved: Record<string, string>;
    };
    expect(created.post).toMatchObject({ slug: "", title: input().title });
    expect(created.unsaved.slug).toMatch(/already uses this slug/);

    // An edit keeps the slug it had, and saves the rest.
    const second = await edit(a, created.post.id, { slug: "its-own-slug" });
    const clash = await edit(a, created.post.id, {
      slug: "written-in-the-admin",
      title: "Edited while clashing",
    });
    expect(second.status).toBe(200);
    expect(await clash.json()).toMatchObject({
      post: { slug: "its-own-slug", title: "Edited while clashing" },
      unsaved: { slug: expect.stringMatching(/already uses/) as unknown },
    });
  });

  it("refuses a published post's edit that takes another post's position", async () => {
    const a = app();
    await createPost(a, "admin", { featured: 1 });
    const { id } = await createPost(a, "admin", { slug: "a-live-post" });
    await publish(a, id);
    const res = await edit(a, id, { slug: "a-live-post", featured: 1 });
    expect(res.status).toBe(409);
  });

  it("lets authors see and edit only their own posts", async () => {
    const a = app();
    const { id } = await createPost(a, "author");
    await createPost(a, "other-author", { slug: "someone-elses-post" });

    const list = await request(a, "/api/posts", { cookie: as("author") });
    const { posts } = (await list.json()) as { posts: { id: string }[] };
    expect(posts.map((post) => post.id)).toEqual([id]);

    const other = await edit(
      a,
      id,
      { title: "Edited by someone else" },
      "other-author",
    );
    expect(other.status).toBe(404);

    const editor = await edit(
      a,
      id,
      { title: "Edited by the editor" },
      "editor",
    );
    expect(editor.status).toBe(200);
  });

  it("does not let authors publish", async () => {
    const a = app();
    const { id } = await createPost(a, "author");
    expect((await publish(a, id, "author")).status).toBe(403);
  });

  it("lets authors read their published posts but leaves edits to editors", async () => {
    const a = app();
    const { id } = await createPost(a, "author");
    expect((await publish(a, id, "editor")).status).toBe(200);
    expect(
      (await request(a, `/api/posts/${id}`, { cookie: as("author") })).status,
    ).toBe(200);
    expect(
      (await request(a, `/api/posts/${id}/revisions`, { cookie: as("author") }))
        .status,
    ).toBe(200);

    const res = await edit(
      a,
      id,
      { title: "Changed after it went live" },
      "author",
    );
    expect(res.status).toBe(403);
    const [revision] = await stores.revisions.list(id);
    const restore = await request(
      a,
      `/api/posts/${id}/revisions/${revision?.id}/restore`,
      {
        method: "POST",
        cookie: as("author"),
        headers: { "if-match": '"2"' },
      },
    );
    expect(restore.status).toBe(403);
    expect((await stores.posts.findById(id))?.title).toBe(
      "Written in the admin",
    );
  });

  it("keeps featured, canonical and noindex out of authors' hands", async () => {
    const a = app();
    const { id } = await createPost(a, "author", {
      featured: 2,
      canonical: "https://example.com/original",
      noindex: true,
    });
    let post = await stores.posts.findById(id);
    expect(post).not.toHaveProperty("featured");
    expect(post).not.toHaveProperty("canonical");
    expect(post?.noindex).toBe(false);

    // An editor sets them; the author's later saves keep them.
    expect(
      (
        await edit(
          a,
          id,
          {
            featured: 4,
            canonical: "https://example.com/first",
            noindex: true,
          },
          "editor",
        )
      ).status,
    ).toBe(200);
    expect(
      (await edit(a, id, { title: "Retitled by the author" }, "author")).status,
    ).toBe(200);
    post = await stores.posts.findById(id);
    expect(post).toMatchObject({
      title: "Retitled by the author",
      featured: 4,
      canonical: "https://example.com/first",
      noindex: true,
    });
  });

  it("publishes, keeps the first publish time and asks the site to refresh", async () => {
    const revalidate = vi.fn(async () => true);
    let clock = new Date("2026-10-22T09:00:00Z");
    const a = app({ site: testSite({ revalidate }), now: () => clock });
    const { id } = await createPost(a, "author");
    expect(revalidate).not.toHaveBeenCalled();

    const res = await publish(a, id, "editor");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      post: { status: "published", publishedAt: "2026-10-22T09:00:00.000Z" },
      revalidated: true,
    });
    expect(revalidate).toHaveBeenCalledTimes(1);

    clock = new Date("2026-10-23T09:00:00Z");
    const edited = await edit(
      a,
      id,
      { title: "Edited after publishing" },
      "editor",
    );
    expect(await edited.json()).toMatchObject({
      post: {
        publishedAt: "2026-10-22T09:00:00.000Z",
        updatedAt: "2026-10-23T09:00:00.000Z",
      },
    });
    expect(revalidate).toHaveBeenCalledTimes(2);
  });

  it("still publishes when the site can't be refreshed", async () => {
    const a = app({ site: testSite({ revalidate: async () => false }) });
    const { id } = await createPost(a);
    const res = await publish(a, id);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ revalidated: false });
  });

  it("keeps the slug of a published post", async () => {
    const a = app();
    const { id } = await createPost(a);
    await publish(a, id);
    const res = await edit(a, id, { slug: "a-new-slug" });
    expect(res.status).toBe(409);
  });

  it("rejects cross-origin writes", async () => {
    const res = await request(app(), "/api/posts", {
      method: "POST",
      body: input(),
      cookie: as("admin"),
      origin: "https://evil.example",
    });
    expect(res.status).toBe(403);
  });
});

describe("/api/public", () => {
  it("returns published posts only, without internal fields", async () => {
    const a = app({ now: () => new Date("2026-10-22T09:00:00Z") });
    const { id } = await createPost(a, "author");
    await createPost(a, "admin", { slug: "still-a-draft" });
    await publish(a, id, "admin");

    const res = await request(a, "/api/public/posts", { origin: null });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({
      posts: [
        {
          slug: "written-in-the-admin",
          title: "Written in the admin",
          summary: input().summary,
          type: "essay",
          tags: ["web"],
          lang: "en",
          date: "2026-10-22",
          noindex: false,
          publishedAt: "2026-10-22T09:00:00.000Z",
          updatedAt: "2026-10-22T09:00:00.000Z",
          authorName: "Name of author",
          body: input().body,
        },
      ],
    });
  });

  it("returns a published post by slug and 404s for drafts", async () => {
    const a = app();
    const { id } = await createPost(a);
    expect(
      (await request(a, "/api/public/posts/written-in-the-admin")).status,
    ).toBe(404);
    await publish(a, id);
    const res = await request(a, "/api/public/posts/written-in-the-admin");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      post: { slug: "written-in-the-admin" },
    });
  });

  it("needs no session", async () => {
    const res = await request(app(), "/api/public/posts");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ posts: [] });
  });
});
