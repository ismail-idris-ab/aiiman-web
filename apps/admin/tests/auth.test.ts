import { describe, expect, it } from "vitest";
import { currentUser, login } from "../src/auth";

const user = { id: "u1", email: "a@example.com", name: "A", role: "editor" };

const respond = (body: unknown, status = 200) =>
  (async () => Response.json(body, { status })) as typeof fetch;

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
    const failing = (async () => {
      throw new TypeError("offline");
    }) as typeof fetch;
    const result = await login("a@example.com", "pw", failing);
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
