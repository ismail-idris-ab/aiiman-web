import { textToDoc, type Role } from "@aiiman/shared";
import { MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { hashToken } from "../src/auth/tokens.js";
import { SESSION_COOKIE } from "../src/http/cookies.js";
import { KEEP_REVISIONS } from "../src/posts/revisions.js";
import {
  createMongoStores,
  resetIndexCacheForTests,
  type Stores,
} from "../src/store.js";
import { request, testDeps } from "./helpers.js";

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
      expiresAt: new Date("2100-01-01T00:00:00Z"),
    });
  }
});

const as = (userId: string) => `${SESSION_COOKIE}=token-${userId}`;

/** An app whose clock the test moves. */
function app() {
  const clock = { now: new Date("2026-10-26T09:00:00Z") };
  const a = createApp(
    testDeps({ getStores: async () => stores, now: () => clock.now }),
  );
  const advance = (minutes: number) => {
    clock.now = new Date(clock.now.getTime() + minutes * 60_000);
  };
  return { a, advance };
}

type App = ReturnType<typeof app>["a"];

const input = (overrides: Record<string, unknown> = {}) => ({
  title: "Written in the admin",
  summary:
    "A summary long enough to pass the fifty character minimum for posts.",
  slug: "written-in-the-admin",
  type: "essay",
  tags: ["web"],
  lang: "en",
  noindex: false,
  body: textToDoc("First paragraph."),
  ...overrides,
});

interface Saved {
  post: { id: string; version: number; title: string; status: string };
  issues: Record<string, string>;
}

async function create(a: App, overrides: Record<string, unknown> = {}) {
  const res = await request(a, "/api/posts?autosave=1", {
    method: "POST",
    body: input(overrides),
    cookie: as("author"),
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as Saved).post;
}

const save = (
  a: App,
  id: string,
  version: number | undefined,
  overrides: Record<string, unknown>,
  { autosave = true, userId = "author" } = {},
) =>
  request(a, `/api/posts/${id}${autosave ? "?autosave=1" : ""}`, {
    method: "PUT",
    body: input(overrides),
    cookie: as(userId),
    headers: version === undefined ? {} : { "if-match": `"${version}"` },
  });

interface Listed {
  id: string;
  kind: string;
  title: string;
  savedBy: string;
  words: number;
  excerpt: string;
}

async function history(a: App, id: string, userId = "author") {
  const res = await request(a, `/api/posts/${id}/revisions`, {
    cookie: as(userId),
  });
  return {
    res,
    revisions: ((await res.json()) as { revisions: Listed[] }).revisions,
  };
}

const restore = (a: App, id: string, revisionId: string, version: number) =>
  request(a, `/api/posts/${id}/revisions/${revisionId}/restore`, {
    method: "POST",
    cookie: as("author"),
    headers: { "if-match": `"${version}"` },
  });

describe("autosave", () => {
  it("saves a draft with no title or slug yet, more than one at a time", async () => {
    const { a } = app();
    const first = await create(a, { title: "", slug: "", summary: "" });
    const second = await create(a, { title: "", slug: "", summary: "" });
    expect(first.id).not.toBe(second.id);
  });

  it("folds a writer's autosaves into one revision for five minutes", async () => {
    const { a, advance } = app();
    let post = await create(a, { title: "Draft one" });
    for (const title of ["Draft two", "Draft three"]) {
      advance(1);
      const res = await save(a, post.id, post.version, { title });
      expect(res.status).toBe(200);
      post = ((await res.json()) as Saved).post;
    }
    expect((await history(a, post.id)).revisions.map((r) => r.title)).toEqual([
      "Draft three",
    ]);

    advance(5);
    await save(a, post.id, post.version, { title: "Draft four" });
    const { revisions } = await history(a, post.id);
    expect(revisions.map((r) => r.title)).toEqual([
      "Draft four",
      "Draft three",
    ]);
    expect(revisions[0]).toMatchObject({
      kind: "autosave",
      savedBy: "Name of author",
      words: 2,
      excerpt: "First paragraph.",
    });
  });

  it("starts a new revision for a save the writer chose", async () => {
    const { a, advance } = app();
    const post = await create(a, { title: "Autosaved" });
    advance(1);
    await save(
      a,
      post.id,
      post.version,
      { title: "Saved on purpose" },
      {
        autosave: false,
      },
    );
    const { revisions } = await history(a, post.id);
    expect(revisions.map((r) => [r.kind, r.title])).toEqual([
      ["save", "Saved on purpose"],
      ["autosave", "Autosaved"],
    ]);
  });

  it(`keeps only the last ${KEEP_REVISIONS} versions`, async () => {
    const { a, advance } = app();
    let post = await create(a, { title: "Version 0" });
    for (let n = 1; n <= KEEP_REVISIONS + 2; n += 1) {
      advance(1);
      const res = await save(
        a,
        post.id,
        post.version,
        { title: `Version ${n}` },
        {
          autosave: false,
        },
      );
      post = ((await res.json()) as Saved).post;
    }
    const { revisions } = await history(a, post.id);
    expect(revisions).toHaveLength(KEEP_REVISIONS);
    expect(revisions[0]?.title).toBe(`Version ${KEEP_REVISIONS + 2}`);
    expect(revisions.at(-1)?.title).toBe("Version 3");
  });

  it("refuses autosaves to a published post: its edits go live", async () => {
    const { a } = app();
    const post = await create(a);
    const published = await request(a, `/api/posts/${post.id}/publish`, {
      method: "POST",
      cookie: as("admin"),
    });
    const { post: live } = (await published.json()) as Saved;
    const res = await save(
      a,
      post.id,
      live.version,
      { title: "Half typed" },
      { userId: "admin" },
    );
    expect(res.status).toBe(409);
    // A chosen save must meet the publishing rules.
    const short = await save(
      a,
      post.id,
      live.version,
      { title: "Short" },
      {
        autosave: false,
        userId: "admin",
      },
    );
    expect(short.status).toBe(400);
  });
});

describe("concurrent edits", () => {
  it("refuses an edit made on an older version and returns the current one", async () => {
    const { a } = app();
    const post = await create(a);
    // Two tabs opened the same version; the first one saves.
    const first = await save(a, post.id, post.version, {
      title: "From tab one",
    });
    expect(first.status).toBe(200);
    const second = await save(a, post.id, post.version, {
      title: "From tab two",
    });
    expect(second.status).toBe(412);
    const body = (await second.json()) as {
      error: string;
      post: Saved["post"];
    };
    expect(body.post.title).toBe("From tab one");
    expect(body.error).toMatch(/saved somewhere else/);
    expect((await stores.posts.findById(post.id))?.title).toBe("From tab one");
  });

  it("keeps the other version in the history when a writer keeps theirs", async () => {
    const { a } = app();
    const post = await create(a);
    const first = await save(a, post.id, post.version, {
      title: "From tab one",
    });
    const { post: current } = (await first.json()) as Saved;
    // Tab two chose to keep its version, on top of the one it was shown.
    const kept = await save(
      a,
      post.id,
      current.version,
      { title: "From tab two" },
      {
        autosave: false,
      },
    );
    expect(kept.status).toBe(200);
    const { revisions } = await history(a, post.id);
    expect(revisions.map((r) => r.title)).toEqual([
      "From tab two",
      "From tab one",
    ]);
  });

  it("requires the version an edit was made on", async () => {
    const { a } = app();
    const post = await create(a);
    const res = await save(a, post.id, undefined, { title: "No version" });
    expect(res.status).toBe(428);
  });
});

describe("restoring", () => {
  it("replaces the current draft and keeps it recoverable", async () => {
    const { a, advance } = app();
    let post = await create(a, { title: "The good version" });
    advance(10);
    const bad = await save(a, post.id, post.version, {
      title: "The bad edit",
      body: textToDoc(""),
    });
    post = ((await bad.json()) as Saved).post;

    const before = await history(a, post.id);
    const good = before.revisions.find((r) => r.title === "The good version");
    if (good === undefined) throw new Error("good version missing");
    const res = await restore(a, post.id, good.id, post.version);
    expect(res.status).toBe(200);
    const restored = (await res.json()) as Saved & { restoredFrom: string };
    expect(restored.post.title).toBe("The good version");
    expect(restored.restoredFrom).toBe("2026-10-26T09:00:00.000Z");

    const after = await history(a, post.id);
    expect(after.revisions.map((r) => [r.kind, r.title])).toEqual([
      ["restore", "The good version"],
      ["autosave", "The bad edit"],
      ["autosave", "The good version"],
    ]);
    // The restore itself can be undone.
    const undo = after.revisions[1];
    if (undo === undefined) throw new Error("bad edit missing");
    const back = await restore(a, post.id, undo.id, restored.post.version);
    expect(((await back.json()) as Saved).post.title).toBe("The bad edit");
  });

  it("refuses a restore on an older version", async () => {
    const { a } = app();
    const post = await create(a);
    const { revisions } = await history(a, post.id);
    await save(a, post.id, post.version, { title: "Saved in another tab" });
    const res = await restore(a, post.id, revisions[0]?.id ?? "", post.version);
    expect(res.status).toBe(412);
  });

  it("404s for a revision of another post", async () => {
    const { a } = app();
    const post = await create(a);
    const other = await create(a, { slug: "another-post" });
    const { revisions } = await history(a, other.id);
    const res = await restore(a, post.id, revisions[0]?.id ?? "", post.version);
    expect(res.status).toBe(404);
  });

  it("shows a post's history only to people who may edit it", async () => {
    const { a } = app();
    const post = await create(a);
    expect((await history(a, post.id, "other-author")).res.status).toBe(404);
    expect((await history(a, post.id, "admin")).res.status).toBe(200);
  });
});

describe("incomplete drafts", () => {
  it("list what's missing and can't be previewed or published yet", async () => {
    const { a } = app();
    const post = await create(a, { title: "Short", summary: "" });
    const preview = await request(a, `/api/posts/${post.id}/preview`, {
      method: "POST",
      cookie: as("author"),
    });
    expect(preview.status).toBe(400);
    const publish = await request(a, `/api/posts/${post.id}/publish`, {
      method: "POST",
      cookie: as("admin"),
    });
    expect(publish.status).toBe(400);
    expect(
      Object.keys(((await publish.json()) as { fields: object }).fields).sort(),
    ).toEqual(["summary", "title"]);
  });

  it("aren't served to the site's draft preview", async () => {
    const secret = "s".repeat(32);
    const a = createApp(
      testDeps({ getStores: async () => stores, siteSecret: secret }),
    );
    const res = await request(a, "/api/posts", {
      method: "POST",
      body: input({ slug: "" }),
      cookie: as("author"),
    });
    const { post } = (await res.json()) as Saved;
    const preview = await request(a, `/api/preview/posts/${post.id}`, {
      origin: null,
      headers: { authorization: `Bearer ${secret}` },
    });
    expect(preview.status).toBe(404);
  });
});
