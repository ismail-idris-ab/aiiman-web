import { describe, expect, it, vi } from "vitest";
import {
  changePassword,
  checkPasswordLink,
  currentUser,
  linkToken,
  login,
  passwordLinkUrl,
  redeemPasswordLink,
  saveProfile,
} from "../src/auth";
import {
  addUser,
  changeAccess,
  listUsers,
  makePasswordLink,
} from "../src/users";

const user = {
  id: "u1",
  email: "a@example.com",
  name: "A",
  role: "editor",
  status: "active",
  passwordSet: true,
  createdAt: "2026-10-22T00:00:00.000Z",
};
const TOKEN = "a".repeat(43);
const link = {
  token: TOKEN,
  kind: "setup",
  expiresAt: "2026-10-29T09:00:00.000Z",
};

const respond = (body: unknown, status = 200) =>
  vi.fn(async () =>
    status === 204
      ? new Response(null, { status })
      : Response.json(body, { status }),
  ) as unknown as typeof fetch;

const offline = (async () => {
  throw new TypeError("offline");
}) as typeof fetch;

describe("login", () => {
  it("returns the user on success", async () => {
    expect(await login("a@example.com", "pw", respond({ user }))).toEqual({
      ok: true,
      user,
    });
  });

  it("passes the server's error message through", async () => {
    const result = await login(
      "a@example.com",
      "pw",
      respond({ error: "Email or password is incorrect" }, 401),
    );
    expect(result).toEqual({
      ok: false,
      error: "Email or password is incorrect",
    });
  });

  it("reports a network failure plainly", async () => {
    const result = await login("a@example.com", "pw", offline);
    expect(result.ok).toBe(false);
  });

  it("rejects a malformed user payload", async () => {
    const result = await login(
      "a@example.com",
      "pw",
      respond({ user: { ...user, role: "superuser" } }),
    );
    expect(result.ok).toBe(false);
  });
});

describe("currentUser", () => {
  it("returns the user when signed in and null otherwise", async () => {
    expect(await currentUser(respond({ user }))).toEqual(user);
    expect(
      await currentUser(respond({ error: "Not signed in" }, 401)),
    ).toBeNull();
  });
});

describe("password links", () => {
  it("reads the token from the fragment of /set-password only", () => {
    expect(linkToken({ pathname: "/set-password", hash: `#${TOKEN}` })).toBe(
      TOKEN,
    );
    expect(linkToken({ pathname: "/set-password", hash: "#short" })).toBe("");
    expect(linkToken({ pathname: "/set-password", hash: "" })).toBe("");
    expect(linkToken({ pathname: "/", hash: `#${TOKEN}` })).toBeNull();
  });

  it("builds the link with the token in the fragment", () => {
    expect(passwordLinkUrl("https://admin.example", TOKEN)).toBe(
      `https://admin.example/set-password#${TOKEN}`,
    );
  });

  it("checks a link and reports an expired one with the server's message", async () => {
    expect(
      await checkPasswordLink(TOKEN, respond({ kind: "reset", name: "A" })),
    ).toEqual({ ok: true, kind: "reset", name: "A" });
    expect(
      await checkPasswordLink(TOKEN, respond({ error: "Expired." }, 404)),
    ).toEqual({ ok: false, error: "Expired.", fields: {} });
  });

  it("redeems a link and returns the signed-in user, or the field to fix", async () => {
    const fetcher = respond({ user });
    expect(
      await redeemPasswordLink(TOKEN, "a long passphrase", fetcher),
    ).toEqual({ ok: true, user });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/auth/password-link/use",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ token: TOKEN, password: "a long passphrase" }),
      }),
    );
    expect(
      await redeemPasswordLink(
        TOKEN,
        "short",
        respond({ error: "Too short", fields: { password: "Use 12" } }, 400),
      ),
    ).toEqual({
      ok: false,
      error: "Too short",
      fields: { password: "Use 12" },
    });
  });
});

describe("account", () => {
  it("changes the password (204 is success)", async () => {
    expect(await changePassword("old", "new one", respond(null, 204))).toEqual({
      ok: true,
    });
    expect(
      await changePassword(
        "wrong",
        "new one",
        respond({ error: "Wrong", fields: { currentPassword: "Wrong" } }, 400),
      ),
    ).toEqual({
      ok: false,
      error: "Wrong",
      fields: { currentPassword: "Wrong" },
    });
  });

  it("saves the profile", async () => {
    const saved = { ...user, name: "B", bio: "Bio." };
    expect(
      await saveProfile({ name: "B", bio: "Bio." }, respond({ user: saved })),
    ).toEqual({ ok: true, user: saved });
    expect((await saveProfile({ name: "B" }, offline)).ok).toBe(false);
  });
});

describe("users", () => {
  it("lists users, or null when the list can't be read", async () => {
    expect(await listUsers(respond({ users: [user] }))).toEqual([user]);
    expect(await listUsers(respond({ users: [{ id: 1 }] }))).toBeNull();
    expect(await listUsers(respond({ error: "No" }, 403))).toBeNull();
  });

  it("adds a user and returns their setup link", async () => {
    expect(
      await addUser(
        { name: "A", email: "a@example.com", role: "author" },
        respond({ user, link }),
      ),
    ).toEqual({ ok: true, user, link });
  });

  it("changes access and makes links", async () => {
    const fetcher = respond({ user: { ...user, role: "author" } });
    const result = await changeAccess("u 1", { role: "author" }, fetcher);
    expect(result.ok && result.user.role).toBe("author");
    expect(fetcher).toHaveBeenCalledWith(
      "/api/users/u%201",
      expect.objectContaining({ method: "PATCH" }),
    );
    expect(await makePasswordLink("u1", respond({ link }))).toEqual({
      ok: true,
      link,
    });
  });
});
