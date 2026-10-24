import { textToDoc } from "@aiiman/shared";
import { MongoClient, type Db } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { hashToken } from "../src/auth/tokens.js";
import { SESSION_COOKIE } from "../src/http/cookies.js";
import { SiteUnavailableError } from "../src/site.js";
import {
  createMongoStores,
  resetIndexCacheForTests,
  type Stores,
} from "../src/store.js";
import { request, testDeps, testSite } from "./helpers.js";

const SECRET = "s".repeat(40);
const cookie = `${SESSION_COOKIE}=token-admin`;

let mongod: MongoMemoryServer;
let client: MongoClient;
let db: Db;
let stores: Stores;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  client = await MongoClient.connect(mongod.getUri());
}, 300_000);

afterAll(async () => {
  await client?.close();
  await mongod?.stop();
});

beforeEach(async () => {
  resetIndexCacheForTests();
  db = client.db(`test-${crypto.randomUUID()}`);
  stores = createMongoStores(db);
  await stores.users.insert({
    id: "admin",
    email: "admin@example.com",
    name: "Admin",
    role: "admin",
    status: "active",
    passwordHash: "unused",
    createdAt: new Date("2026-10-22T00:00:00Z"),
  });
  await stores.sessions.insert({
    tokenHash: hashToken("token-admin"),
    userId: "admin",
    createdAt: new Date(),
    expiresAt: new Date("2100-01-01T00:00:00Z"),
  });
});

function app(overrides: Parameters<typeof testDeps>[0] = {}) {
  return createApp(testDeps({ getStores: async () => stores, ...overrides }));
}

const input = (overrides: Record<string, unknown> = {}) => ({
  title: "Written in the admin",
  summary:
    "A summary long enough to pass the fifty character minimum for posts.",
  slug: "written-in-the-admin",
  type: "tutorial",
  tags: ["web", "nigeria"],
  lang: "ha",
  noindex: false,
  body: textToDoc("Hello."),
  ...overrides,
});

type Json = Record<string, unknown> & { post: Record<string, unknown> };

async function create(a: ReturnType<typeof app>, overrides = {}) {
  const res = await request(a, "/api/posts", {
    method: "POST",
    body: input(overrides),
    cookie,
  });
  return { res, body: (await res.json()) as Json };
}

const put = (a: ReturnType<typeof app>, id: unknown, overrides = {}) =>
  request(a, `/api/posts/${String(id)}`, {
    method: "PUT",
    body: input(overrides),
    cookie,
  });

const publish = (a: ReturnType<typeof app>, id: unknown) =>
  request(a, `/api/posts/${String(id)}/publish`, { method: "POST", cookie });

describe("post metadata", () => {
  it("stores every field and leaves unset ones absent", async () => {
    const { res, body } = await create(app());
    expect(res.status).toBe(201);
    expect(body.post).toMatchObject({
      type: "tutorial",
      tags: ["web", "nigeria"],
      lang: "ha",
      noindex: false,
    });
    const stored = await db
      .collection("posts")
      .findOne({ _id: body.post.id as never });
    expect(stored).not.toHaveProperty("featured");
    expect(stored).not.toHaveProperty("date");
  });

  it("clears optional fields an edit leaves out", async () => {
    const a = app();
    const { body } = await create(a, {
      featured: 2,
      canonical: "https://example.com/original",
    });
    const res = await put(a, body.post.id);
    const { post } = (await res.json()) as Json;
    expect(post).not.toHaveProperty("featured");
    expect(post).not.toHaveProperty("canonical");
  });

  it("returns field messages for broken rules", async () => {
    const { res, body } = await create(app(), {
      tags: ["Not Kebab"],
      date: "2026-10-22",
      updated: "2026-10-01",
      canonical: "http://insecure.example",
    });
    expect(res.status).toBe(400);
    expect(Object.keys(body.fields as object).sort()).toEqual([
      "canonical",
      "tags.0",
      "updated",
    ]);
  });

  it("keeps featured positions unique, drafts included", async () => {
    const a = app();
    await create(a, { featured: 3 });
    const { res, body } = await create(a, {
      slug: "another-post",
      featured: 3,
    });
    expect(res.status).toBe(409);
    expect(body.fields).toEqual({
      featured: "Another post already has this featured position",
    });
    // Positions are free again once released.
    const { body: other } = await create(a, { slug: "third-post" });
    const first = (await stores.posts.list()).find(
      (post) => post.slug === "written-in-the-admin",
    );
    await put(a, first?.id);
    expect(
      (await put(a, other.post.id, { slug: "third-post", featured: 3 })).status,
    ).toBe(200);
  });

  it("dates a post at publish in WAT when it has no date", async () => {
    // 23:30 UTC on the 21st is already the 22nd in Lagos.
    const a = app({ now: () => new Date("2026-10-21T23:30:00Z") });
    const { body } = await create(a);
    const res = await publish(a, body.post.id);
    expect(await res.json()).toMatchObject({ post: { date: "2026-10-22" } });
  });

  it("keeps a chosen date and keeps the date when an edit clears it", async () => {
    const a = app();
    const { body } = await create(a, { date: "2026-09-01" });
    await publish(a, body.post.id);
    const res = await put(a, body.post.id);
    expect(await res.json()).toMatchObject({ post: { date: "2026-09-01" } });
  });

  it("publishes while pages still live in MDX", async () => {
    const a = app();
    const { body } = await create(a);
    expect((await publish(a, body.post.id)).status).toBe(200);
  });

  it("refuses to publish until required pages are published", async () => {
    await db.collection("pages").insertMany([
      { _id: "about" as never, status: "published" },
      { _id: "privacy" as never, status: "draft" },
    ]);
    const a = app();
    const { body } = await create(a);
    const res = await publish(a, body.post.id);
    expect(res.status).toBe(409);
    expect(((await res.json()) as Json).error).toContain("privacy");
  });
});

describe("previews", () => {
  it("returns the site's search preview, a share image and a reader link", async () => {
    const a = app();
    const { body } = await create(a);
    const id = String(body.post.id);
    const res = await request(a, `/api/posts/${id}/preview`, {
      method: "POST",
      cookie,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      search: { title: "Title · Aiiman", indexed: true },
      readerUrl: `https://site.example/api/draft?post=${id}`,
      shareImageUrl: expect.stringMatching(
        new RegExp(`^/api/posts/${id}/share-image\\?v=\\d+$`),
      ),
    });

    const image = await request(a, `/api/posts/${id}/share-image`, { cookie });
    expect(image.headers.get("content-type")).toBe("image/png");
    expect(image.headers.get("cache-control")).toBe("no-store");
  });

  it("answers 503 when the site isn't connected", async () => {
    const unavailable = async () => {
      throw new SiteUnavailableError("not set");
    };
    const a = app({
      site: testSite({ searchPreview: unavailable, shareImage: unavailable }),
    });
    const { body } = await create(a);
    const id = String(body.post.id);
    expect(
      (await request(a, `/api/posts/${id}/preview`, { method: "POST", cookie }))
        .status,
    ).toBe(503);
    expect(
      (await request(a, `/api/posts/${id}/share-image`, { cookie })).status,
    ).toBe(503);
  });

  it("needs a session", async () => {
    const a = app();
    const { body } = await create(a);
    const res = await request(a, `/api/posts/${String(body.post.id)}/preview`, {
      method: "POST",
    });
    expect(res.status).toBe(401);
  });
});

describe("/api/preview (site only)", () => {
  it("returns any post, drafts included, with the shared secret", async () => {
    const a = app({
      siteSecret: SECRET,
      now: () => new Date("2026-10-22T09:00:00Z"),
    });
    const { body } = await create(a);
    const res = await request(a, `/api/preview/posts/${String(body.post.id)}`, {
      headers: { authorization: `Bearer ${SECRET}` },
    });
    expect(res.status).toBe(200);
    const { post } = (await res.json()) as Json;
    expect(post).toMatchObject({
      slug: "written-in-the-admin",
      status: "draft",
      date: "2026-10-22",
      authorName: "Admin",
    });
    expect(post).not.toHaveProperty("id");
    expect(post).not.toHaveProperty("authorId");
  });

  it.each([
    ["no header", undefined],
    ["a wrong secret", `Bearer ${"x".repeat(40)}`],
  ])("rejects %s", async (_name, authorization) => {
    const a = app({ siteSecret: SECRET });
    const { body } = await create(a);
    const res = await request(a, `/api/preview/posts/${String(body.post.id)}`, {
      headers: authorization === undefined ? {} : { authorization },
    });
    expect(res.status).toBe(401);
  });

  it("is closed when no secret is configured", async () => {
    const a = app();
    const { body } = await create(a);
    const res = await request(a, `/api/preview/posts/${String(body.post.id)}`, {
      headers: { authorization: "Bearer " },
    });
    expect(res.status).toBe(401);
  });
});
