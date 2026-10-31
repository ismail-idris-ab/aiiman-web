import { MongoClient, type Db } from "mongodb";
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
import { createMemoryLimiter, MAX_FAILURES } from "../src/auth/limiter.js";
import { hashPassword } from "../src/auth/password.js";
import { SESSION_DAYS } from "../src/auth/routes.js";
import { hashToken } from "../src/auth/tokens.js";
import {
  createMongoStores,
  resetIndexCacheForTests,
  type Stores,
  type User,
} from "../src/store.js";
import { cookieFrom, request, testDeps } from "./helpers.js";

const PASSWORD = "correct horse battery staple";

let mongod: MongoMemoryServer;
let client: MongoClient;
let db: Db;
let stores: Stores;
let passwordHash: string;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  client = await MongoClient.connect(mongod.getUri());
  passwordHash = await hashPassword(PASSWORD);
}, 300_000);

afterAll(async () => {
  await client?.close();
  await mongod?.stop();
});

beforeEach(async () => {
  db = client.db(`test-${crypto.randomUUID()}`);
  resetIndexCacheForTests();
  stores = createMongoStores(db);
  await stores.users.insert(user());
});

function user(overrides: Partial<User> = {}): User {
  return {
    id: "user-1",
    email: "Writer@Example.com",
    name: "Writer",
    role: "admin",
    status: "active",
    passwordHash,
    createdAt: new Date("2026-10-22T00:00:00Z"),
    ...overrides,
  };
}

function app(overrides: Parameters<typeof testDeps>[0] = {}) {
  return createApp(testDeps({ getStores: async () => stores, ...overrides }));
}

const login = (
  a: ReturnType<typeof app>,
  password = PASSWORD,
  ip = "1.1.1.1",
) =>
  request(a, "/api/auth/login", {
    method: "POST",
    body: { email: "writer@example.com", password },
    headers: { "x-real-ip": ip },
  });

describe("POST /api/auth/login", () => {
  it("signs in with the right password and sets a hardened session cookie", async () => {
    const res = await login(app());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      user: {
        id: "user-1",
        email: "writer@example.com",
        name: "Writer",
        role: "admin",
        status: "active",
        passwordSet: true,
        createdAt: "2026-10-22T00:00:00.000Z",
      },
    });
    const header = res.headers.get("set-cookie") ?? "";
    expect(header).toMatch(/^__Host-aiiman_session=[\w-]{43};/);
    for (const flag of ["HttpOnly", "Secure", "SameSite=Strict", "Path=/"]) {
      expect(header).toContain(flag);
    }
    expect(header).toContain(`Max-Age=${SESSION_DAYS * 86400}`);
  });

  it("stores only the hash of the session token", async () => {
    const res = await login(app());
    const token = cookieFrom(res).split("=")[1] ?? "";
    const sessions = await db.collection("sessions").find().toArray();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?._id).toBe(hashToken(token));
    expect(JSON.stringify(sessions)).not.toContain(token);
  });

  it("matches email case-insensitively", async () => {
    const res = await request(app(), "/api/auth/login", {
      method: "POST",
      body: { email: "  WRITER@example.COM ", password: PASSWORD },
    });
    expect(res.status).toBe(200);
  });

  it("gives the same generic error for a wrong password and an unknown email", async () => {
    const a = app();
    const wrong = await login(a, "wrong password");
    const unknown = await request(a, "/api/auth/login", {
      method: "POST",
      body: { email: "nobody@example.com", password: PASSWORD },
    });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(await wrong.json()).toEqual(await unknown.json());
    expect(wrong.headers.get("set-cookie")).toBeNull();
  });

  it("refuses deactivated users with the same generic error", async () => {
    await db
      .collection("users")
      .updateOne(
        { _id: "user-1" as never },
        { $set: { status: "deactivated" } },
      );
    const res = await login(app());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: "Email or password is incorrect",
    });
  });

  it("rejects invalid input with 400", async () => {
    for (const body of [
      {},
      { email: "not-an-email", password: "x" },
      { email: "a@b.co", password: "" },
    ]) {
      const res = await request(app(), "/api/auth/login", {
        method: "POST",
        body,
      });
      expect(res.status).toBe(400);
    }
  });

  it("locks the account after repeated failures, even with the right password", async () => {
    const a = app({ limiter: createMemoryLimiter() });
    for (let i = 0; i < MAX_FAILURES; i++) {
      // A different IP each time: the account lock must hold on its own.
      expect((await login(a, "wrong", `10.0.0.${i}`)).status).toBe(401);
    }
    const locked = await login(a, PASSWORD, "10.0.0.99");
    expect(locked.status).toBe(429);
    expect(locked.headers.get("set-cookie")).toBeNull();
  });

  it("locks an IP that sprays many accounts", async () => {
    const a = app({ limiter: createMemoryLimiter() });
    for (let i = 0; i < MAX_FAILURES; i++) {
      await request(a, "/api/auth/login", {
        method: "POST",
        body: { email: `user${i}@example.com`, password: "wrong" },
        headers: { "x-real-ip": "6.6.6.6" },
      });
    }
    expect((await login(a, PASSWORD, "6.6.6.6")).status).toBe(429);
    expect((await login(a, PASSWORD, "7.7.7.7")).status).toBe(200);
  });

  it("never logs the email or password", async () => {
    const log = vi.fn();
    const a = app({ log });
    await login(a, "wrong password");
    await login(a);
    const logged = JSON.stringify(log.mock.calls);
    expect(logged).not.toMatch(/writer@example\.com/i);
    expect(logged).not.toContain("wrong password");
    expect(logged).not.toContain(PASSWORD);
  });
});

describe("GET /api/auth/me and POST /api/auth/logout", () => {
  it("returns the signed-in user, then nothing after logout", async () => {
    const a = app();
    const cookie = cookieFrom(await login(a));

    const me = await request(a, "/api/auth/me", { cookie });
    expect(me.status).toBe(200);
    expect(me.headers.get("cache-control")).toBe("no-store");
    expect(((await me.json()) as { user: { id: string } }).user.id).toBe(
      "user-1",
    );

    const out = await request(a, "/api/auth/logout", {
      method: "POST",
      cookie,
    });
    expect(out.status).toBe(204);
    expect(out.headers.get("set-cookie")).toContain("Max-Age=0");

    expect((await request(a, "/api/auth/me", { cookie })).status).toBe(401);
    expect(await db.collection("sessions").countDocuments()).toBe(0);
  });

  it("rejects missing, forged and expired sessions", async () => {
    let now = new Date("2026-10-22T10:00:00Z");
    const a = app({ now: () => now });
    const cookie = cookieFrom(await login(a));

    expect((await request(a, "/api/auth/me")).status).toBe(401);
    expect(
      (
        await request(a, "/api/auth/me", {
          cookie: "__Host-aiiman_session=forged",
        })
      ).status,
    ).toBe(401);

    now = new Date(now.getTime() + SESSION_DAYS * 86400 * 1000 + 1000);
    expect((await request(a, "/api/auth/me", { cookie })).status).toBe(401);
  });

  it("ends an existing session once the user is deactivated", async () => {
    const a = app();
    const cookie = cookieFrom(await login(a));
    await db
      .collection("users")
      .updateOne(
        { _id: "user-1" as never },
        { $set: { status: "deactivated" } },
      );
    expect((await request(a, "/api/auth/me", { cookie })).status).toBe(401);
  });

  it("never returns the password hash", async () => {
    const a = app();
    const res = await login(a);
    const cookie = cookieFrom(res);
    const me = await request(a, "/api/auth/me", { cookie });
    const body = JSON.stringify([await res.json(), await me.json()]);
    expect(body).not.toContain("passwordHash");
    expect(body).not.toContain("$argon2");
  });
});

describe("indexes", () => {
  it("enforces unique emails and expires sessions by TTL", async () => {
    await expect(
      stores.users.insert(user({ id: "user-2", email: "writer@EXAMPLE.com" })),
    ).rejects.toThrow();
    const indexes = await db.collection("sessions").indexes();
    expect(
      indexes.some((i) => i.expireAfterSeconds === 0 && i.key.expiresAt === 1),
    ).toBe(true);
  });
});
