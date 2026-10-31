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
import { createApp, type Logger } from "../src/app.js";
import { MAX_FAILURES } from "../src/auth/limiter.js";
import { hashPassword } from "../src/auth/password.js";
import { hashToken } from "../src/auth/tokens.js";
import { SESSION_COOKIE } from "../src/http/cookies.js";
import {
  createMongoStores,
  resetIndexCacheForTests,
  type Stores,
} from "../src/store.js";
import { cookieFrom, request, testDeps } from "./helpers.js";

const PASSWORD = "correct horse battery staple";
const NEW_PASSWORD = "a brand new passphrase here";

let mongod: MongoMemoryServer;
let client: MongoClient;
let stores: Stores;
let passwordHash: string;
let clock: Date;
let log: ReturnType<typeof vi.fn<Logger>>;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  client = await MongoClient.connect(mongod.getUri());
  passwordHash = await hashPassword(PASSWORD);
}, 300_000);

afterAll(async () => {
  await client?.close();
  await mongod?.stop();
});

const USERS: Record<string, Role> = {
  admin: "admin",
  editor: "editor",
  author: "author",
};

beforeEach(async () => {
  resetIndexCacheForTests();
  stores = createMongoStores(client.db(`test-${crypto.randomUUID()}`));
  clock = new Date("2026-10-28T09:00:00Z");
  log = vi.fn<Logger>();
  for (const [id, role] of Object.entries(USERS)) {
    await stores.users.insert({
      id,
      email: `${id}@example.com`,
      name: `Name of ${id}`,
      role,
      status: "active",
      passwordHash,
      createdAt: new Date("2026-10-22T00:00:00Z"),
    });
    await stores.sessions.insert({
      tokenHash: hashToken(`token-${id}`),
      userId: id,
      createdAt: clock,
      expiresAt: new Date("2100-01-01T00:00:00Z"),
    });
  }
});

const as = (userId: string) => `${SESSION_COOKIE}=token-${userId}`;

function app() {
  return createApp(
    testDeps({ getStores: async () => stores, now: () => clock, log }),
  );
}

interface Link {
  token: string;
  kind: string;
  expiresAt: string;
}

async function addUser(
  a: ReturnType<typeof app>,
  body: Record<string, unknown> = {},
) {
  const res = await request(a, "/api/users", {
    method: "POST",
    body: {
      name: "Amina Bello",
      email: "Amina@Example.com",
      role: "author",
      ...body,
    },
    cookie: as("admin"),
  });
  expect(res.status).toBe(201);
  return (await res.json()) as { user: { id: string }; link: Link };
}

const useLink = (
  a: ReturnType<typeof app>,
  token: string,
  password = PASSWORD,
) =>
  request(a, "/api/auth/password-link/use", {
    method: "POST",
    body: { token, password },
  });

const checkLink = (a: ReturnType<typeof app>, token: string) =>
  request(a, "/api/auth/password-link", { method: "POST", body: { token } });

const login = (a: ReturnType<typeof app>, email: string, password: string) =>
  request(a, "/api/auth/login", {
    method: "POST",
    body: { email, password },
  });

const me = (a: ReturnType<typeof app>, cookie: string) =>
  request(a, "/api/auth/me", { cookie });

describe("adding a user", () => {
  it("creates them without a password and returns a 24-hour setup link", async () => {
    const a = app();
    const { user, link } = await addUser(a);
    expect(link.kind).toBe("setup");
    expect(link.token).toMatch(/^[\w-]{43}$/);
    expect(new Date(link.expiresAt).getTime() - clock.getTime()).toBe(
      24 * 60 * 60 * 1000,
    );
    // Only the hash is stored.
    expect(await stores.passwordLinks.find(link.token, clock)).toBeNull();
    expect(
      await stores.passwordLinks.find(hashToken(link.token), clock),
    ).not.toBeNull();

    const list = await request(a, "/api/users", { cookie: as("admin") });
    const { users } = (await list.json()) as {
      users: Record<string, unknown>[];
    };
    const added = users.find((u) => u.id === user.id);
    expect(added).toMatchObject({
      name: "Amina Bello",
      email: "amina@example.com",
      role: "author",
      status: "active",
      passwordSet: false,
    });
    expect(JSON.stringify(users)).not.toContain("passwordHash");
  });

  it("can't sign in before choosing a password", async () => {
    const a = app();
    await addUser(a);
    expect((await login(a, "amina@example.com", PASSWORD)).status).toBe(401);
  });

  it("refuses an email that's already taken, in any case", async () => {
    const a = app();
    const res = await request(a, "/api/users", {
      method: "POST",
      body: { name: "Again", email: "EDITOR@example.com", role: "author" },
      cookie: as("admin"),
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      fields: { email: expect.any(String) },
    });
  });

  it("names the fields to fix", async () => {
    const res = await request(app(), "/api/users", {
      method: "POST",
      body: { name: "", email: "nope", role: "owner" },
      cookie: as("admin"),
    });
    expect(res.status).toBe(400);
    const { fields } = (await res.json()) as { fields: object };
    expect(Object.keys(fields).sort()).toEqual(["email", "name", "role"]);
  });
});

describe("setup and reset links", () => {
  it("lets the new user choose a password once, and signs them in", async () => {
    const a = app();
    const { link } = await addUser(a);
    const check = await checkLink(a, link.token);
    expect(check.status).toBe(200);
    expect(await check.json()).toEqual({ kind: "setup", name: "Amina Bello" });

    const res = await useLink(a, link.token);
    expect(res.status).toBe(200);
    expect(await me(a, cookieFrom(res))).toHaveProperty("status", 200);
    expect((await login(a, "amina@example.com", PASSWORD)).status).toBe(200);

    // Single use.
    expect((await checkLink(a, link.token)).status).toBe(404);
    expect((await useLink(a, link.token, NEW_PASSWORD)).status).toBe(404);
    expect((await login(a, "amina@example.com", NEW_PASSWORD)).status).toBe(
      401,
    );
  });

  it("refuses a short password without using up the link", async () => {
    const a = app();
    const { link } = await addUser(a);
    const res = await useLink(a, link.token, "too short");
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      fields: { password: expect.stringContaining("12") },
    });
    expect((await useLink(a, link.token)).status).toBe(200);
  });

  it("stops working after 24 hours", async () => {
    const a = app();
    const { link } = await addUser(a);
    clock = new Date(clock.getTime() + 24 * 60 * 60 * 1000);
    expect((await checkLink(a, link.token)).status).toBe(404);
    expect((await useLink(a, link.token)).status).toBe(404);
  });

  it("works just before it expires", async () => {
    const a = app();
    const { link } = await addUser(a);
    clock = new Date(clock.getTime() + 24 * 60 * 60 * 1000 - 1000);
    expect((await useLink(a, link.token)).status).toBe(200);
  });

  it("refuses made-up and malformed tokens with the same message", async () => {
    const a = app();
    const made = await checkLink(a, "a".repeat(43));
    const malformed = await useLink(a, "../../etc");
    expect(made.status).toBe(404);
    expect(malformed.status).toBe(404);
    expect(await made.json()).toEqual(await malformed.json());
  });

  it("a new link replaces the old one", async () => {
    const a = app();
    const { user, link } = await addUser(a);
    const res = await request(a, `/api/users/${user.id}/password-link`, {
      method: "POST",
      cookie: as("admin"),
    });
    expect(res.status).toBe(201);
    const { link: second } = (await res.json()) as { link: Link };
    expect(second.kind).toBe("setup");
    expect((await useLink(a, link.token)).status).toBe(404);
    expect((await useLink(a, second.token)).status).toBe(200);
  });

  it("a reset link sets a new password and ends every other session", async () => {
    const a = app();
    const res = await request(a, "/api/users/editor/password-link", {
      method: "POST",
      cookie: as("admin"),
    });
    const { link } = (await res.json()) as { link: Link };
    expect(link.kind).toBe("reset");
    // Making the link alone doesn't sign anyone out.
    expect((await me(a, as("editor"))).status).toBe(200);

    const used = await useLink(a, link.token, NEW_PASSWORD);
    expect(used.status).toBe(200);
    expect((await me(a, as("editor"))).status).toBe(401);
    expect((await me(a, cookieFrom(used))).status).toBe(200);
    expect((await login(a, "editor@example.com", PASSWORD)).status).toBe(401);
    expect((await login(a, "editor@example.com", NEW_PASSWORD)).status).toBe(
      200,
    );
  });
});

describe("changing access", () => {
  it("changes a role, which takes effect on the next request", async () => {
    const a = app();
    const post = await request(a, "/api/posts", {
      method: "POST",
      body: {
        title: "Written by the author",
        summary:
          "A summary long enough to pass the fifty character minimum for posts.",
        slug: "written-by-the-author",
        type: "essay",
        tags: ["web"],
        lang: "en",
        noindex: false,
        body: textToDoc("Text."),
      },
      cookie: as("author"),
    });
    const { post: created } = (await post.json()) as { post: { id: string } };
    const publish = () =>
      request(a, `/api/posts/${created.id}/publish`, {
        method: "POST",
        cookie: as("author"),
      });
    expect((await publish()).status).toBe(403);

    const res = await request(a, "/api/users/author", {
      method: "PATCH",
      body: { role: "editor" },
      cookie: as("admin"),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ user: { role: "editor" } });
    expect((await publish()).status).toBe(200);
  });

  it("deactivating ends every session and link at once", async () => {
    const a = app();
    await stores.sessions.insert({
      tokenHash: hashToken("phone"),
      userId: "editor",
      createdAt: clock,
      expiresAt: new Date("2100-01-01T00:00:00Z"),
    });
    const linkRes = await request(a, "/api/users/editor/password-link", {
      method: "POST",
      cookie: as("admin"),
    });
    const { link } = (await linkRes.json()) as { link: Link };

    const res = await request(a, "/api/users/editor", {
      method: "PATCH",
      body: { status: "deactivated" },
      cookie: as("admin"),
    });
    expect(res.status).toBe(200);
    expect((await me(a, as("editor"))).status).toBe(401);
    expect((await me(a, `${SESSION_COOKIE}=phone`)).status).toBe(401);
    expect(
      await stores.sessions.findValid(hashToken("phone"), clock),
    ).toBeNull();
    expect((await useLink(a, link.token)).status).toBe(404);
    expect((await login(a, "editor@example.com", PASSWORD)).status).toBe(401);

    // No new links until reactivated.
    const refused = await request(a, "/api/users/editor/password-link", {
      method: "POST",
      cookie: as("admin"),
    });
    expect(refused.status).toBe(409);

    await request(a, "/api/users/editor", {
      method: "PATCH",
      body: { status: "active" },
      cookie: as("admin"),
    });
    expect((await login(a, "editor@example.com", PASSWORD)).status).toBe(200);
  });

  it("refuses changes to your own access", async () => {
    const a = app();
    for (const [method, path, body] of [
      ["PATCH", "/api/users/admin", { role: "author" }],
      ["PATCH", "/api/users/admin", { status: "deactivated" }],
      ["POST", "/api/users/admin/password-link", undefined],
    ] as const) {
      const res = await request(a, path, { method, body, cookie: as("admin") });
      expect(res.status).toBe(403);
    }
    expect((await me(a, as("admin"))).status).toBe(200);
  });

  it("answers 404 for an unknown user and 400 for an empty change", async () => {
    const a = app();
    const missing = await request(a, "/api/users/nobody", {
      method: "PATCH",
      body: { role: "editor" },
      cookie: as("admin"),
    });
    expect(missing.status).toBe(404);
    const empty = await request(a, "/api/users/editor", {
      method: "PATCH",
      body: {},
      cookie: as("admin"),
    });
    expect(empty.status).toBe(400);
  });
});

describe("admin-only endpoints", () => {
  const ENDPOINTS = [
    ["GET", "/api/users", undefined],
    [
      "POST",
      "/api/users",
      { name: "X", email: "x@example.com", role: "admin" },
    ],
    ["PATCH", "/api/users/admin", { role: "author" }],
    ["PATCH", "/api/users/editor", { status: "deactivated" }],
    ["POST", "/api/users/admin/password-link", undefined],
  ] as const;

  it.each(["editor", "author"])(
    "refuse the %s on every route, changing nothing",
    async (userId) => {
      const a = app();
      for (const [method, path, body] of ENDPOINTS) {
        const res = await request(a, path, {
          method,
          body,
          cookie: as(userId),
        });
        expect(res.status, `${method} ${path}`).toBe(403);
      }
      const users = await stores.users.list();
      expect(users).toHaveLength(3);
      expect(users.every((user) => user.status === "active")).toBe(true);
      expect((await stores.users.findById("admin"))?.role).toBe("admin");
    },
  );

  it("refuse anyone signed out", async () => {
    const a = app();
    for (const [method, path, body] of ENDPOINTS) {
      expect((await request(a, path, { method, body })).status).toBe(401);
    }
  });
});

describe("changing your own password", () => {
  const change = (
    a: ReturnType<typeof app>,
    currentPassword: string,
    newPassword = NEW_PASSWORD,
    cookie = as("author"),
  ) =>
    request(a, "/api/auth/password", {
      method: "POST",
      body: { currentPassword, newPassword },
      cookie,
    });

  it("needs the current password, then signs out your other devices", async () => {
    const a = app();
    await stores.sessions.insert({
      tokenHash: hashToken("laptop"),
      userId: "author",
      createdAt: clock,
      expiresAt: new Date("2100-01-01T00:00:00Z"),
    });
    const wrong = await change(a, "not my password at all");
    expect(wrong.status).toBe(400);
    expect(await wrong.json()).toMatchObject({
      fields: { currentPassword: expect.any(String) },
    });

    expect((await change(a, PASSWORD)).status).toBe(204);
    expect((await me(a, as("author"))).status).toBe(200);
    expect((await me(a, `${SESSION_COOKIE}=laptop`)).status).toBe(401);
    expect((await login(a, "author@example.com", NEW_PASSWORD)).status).toBe(
      200,
    );
  });

  it("cancels a pending reset link", async () => {
    const a = app();
    const res = await request(a, "/api/users/author/password-link", {
      method: "POST",
      cookie: as("admin"),
    });
    const { link } = (await res.json()) as { link: Link };
    expect((await change(a, PASSWORD)).status).toBe(204);
    expect((await checkLink(a, link.token)).status).toBe(404);
  });

  it("refuses a short new password", async () => {
    const res = await change(app(), PASSWORD, "short");
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      fields: { newPassword: expect.any(String) },
    });
  });

  it(`locks after ${MAX_FAILURES} wrong guesses`, async () => {
    const a = app();
    for (let i = 0; i < MAX_FAILURES; i++) {
      expect((await change(a, `wrong guess ${i}`)).status).toBe(400);
    }
    expect((await change(a, PASSWORD)).status).toBe(429);
  });

  it("needs a session", async () => {
    expect((await change(app(), PASSWORD, NEW_PASSWORD, "")).status).toBe(401);
  });
});

describe("profile", () => {
  const PHOTO = {
    src: "https://abc123.public.blob.vercel-storage.com/images/me.webp",
    width: 800,
    height: 800,
    blurDataURL: "data:image/webp;base64,UklGRkAAAABXRUJQ",
  };
  const save = (body: unknown, userId = "author") =>
    request(app(), "/api/profile", { method: "PUT", body, cookie: as(userId) });

  it("updates your name, bio and an uploaded photo", async () => {
    await stores.uploads.insert({
      ...PHOTO,
      url: PHOTO.src,
      contentType: "image/webp",
      bytes: 100,
      uploadedBy: "author",
      createdAt: clock,
    });
    const res = await save({
      name: "Amina",
      bio: "Writes about Kano.",
      photo: PHOTO,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      user: {
        id: "author",
        name: "Amina",
        bio: "Writes about Kano.",
        photo: PHOTO,
      },
    });

    // Leaving them out clears them.
    await save({ name: "Amina" });
    const user = await stores.users.findById("author");
    expect(user?.bio).toBeUndefined();
    expect(user?.photo).toBeUndefined();
  });

  it("refuses a photo that wasn't uploaded here", async () => {
    const res = await save({ name: "Amina", photo: PHOTO });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      fields: { photo: expect.any(String) },
    });
  });

  it("can't change your role or email", async () => {
    await save({ name: "Amina", role: "admin", email: "new@example.com" });
    const user = await stores.users.findById("author");
    expect(user?.role).toBe("author");
    expect(user?.email).toBe("author@example.com");
  });
});

describe("logs", () => {
  it("never contain emails, passwords, tokens or session IDs", async () => {
    const a = app();
    const { user, link } = await addUser(a);
    await checkLink(a, link.token);
    const used = await useLink(a, link.token);
    const session = cookieFrom(used).split("=")[1] ?? "";
    await login(a, "amina@example.com", "a wrong password here");
    await login(a, "nobody@example.com", PASSWORD);
    await login(a, "amina@example.com", PASSWORD);
    await request(a, "/api/auth/password", {
      method: "POST",
      body: {
        currentPassword: "wrong current password",
        newPassword: NEW_PASSWORD,
      },
      cookie: cookieFrom(used),
    });
    await request(a, "/api/auth/password", {
      method: "POST",
      body: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD },
      cookie: cookieFrom(used),
    });
    const reset = await request(a, `/api/users/${user.id}/password-link`, {
      method: "POST",
      cookie: as("admin"),
    });
    const { link: resetLink } = (await reset.json()) as { link: Link };
    await useLink(a, resetLink.token, "yet another long passphrase");
    await useLink(a, resetLink.token);
    await request(a, `/api/users/${user.id}`, {
      method: "PATCH",
      body: { status: "deactivated" },
      cookie: as("admin"),
    });

    const logged = JSON.stringify(log.mock.calls).toLowerCase();
    expect(log).toHaveBeenCalledWith(
      "users.created",
      expect.objectContaining({ userId: user.id }),
    );
    for (const secret of [
      "amina@example.com",
      "nobody@example.com",
      "@example.com",
      PASSWORD,
      NEW_PASSWORD,
      "a wrong password here",
      "wrong current password",
      "yet another long passphrase",
      link.token,
      hashToken(link.token),
      resetLink.token,
      session,
      hashToken(session),
      "token-admin",
    ]) {
      expect(logged).not.toContain(secret.toLowerCase());
    }
  });
});
