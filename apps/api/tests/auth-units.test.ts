import { describe, expect, it } from "vitest";
import {
  createMemoryLimiter,
  LOCK_SECONDS,
  MAX_FAILURES,
} from "../src/auth/limiter.js";
import {
  hashPassword,
  verifyAgainstDummy,
  verifyPassword,
} from "../src/auth/password.js";
import { hashToken, newToken } from "../src/auth/tokens.js";
import { readCookie } from "../src/http/cookies.js";

describe("memory login limiter", () => {
  it("locks a key at the failure limit and unlocks after the window", async () => {
    let now = 0;
    const limiter = createMemoryLimiter(() => now);
    for (let i = 0; i < MAX_FAILURES - 1; i++) await limiter.recordFailure("k");
    expect(await limiter.isLocked("k")).toBe(false);
    await limiter.recordFailure("k");
    expect(await limiter.isLocked("k")).toBe(true);
    expect(await limiter.isLocked("other")).toBe(false);

    now += LOCK_SECONDS * 1000;
    expect(await limiter.isLocked("k")).toBe(false);
  });

  it("clears a key on reset", async () => {
    const limiter = createMemoryLimiter();
    for (let i = 0; i < MAX_FAILURES; i++) await limiter.recordFailure("k");
    await limiter.reset("k");
    expect(await limiter.isLocked("k")).toBe(false);
  });
});

describe("passwords", () => {
  it("hashes with argon2id and verifies only the right password", async () => {
    const hash = await hashPassword("a long enough password");
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(hash, "a long enough password")).toBe(true);
    expect(await verifyPassword(hash, "wrong")).toBe(false);
  });

  it("treats a corrupt hash as a failed check", async () => {
    expect(await verifyPassword("not a hash", "x")).toBe(false);
  });

  it("dummy verification always fails", async () => {
    expect(await verifyAgainstDummy("dummy password that never matches")).toBe(
      false,
    );
  });
});

describe("tokens", () => {
  it("are unique, URL-safe and hash deterministically", () => {
    const a = newToken();
    expect(a).toMatch(/^[\w-]{43}$/);
    expect(newToken()).not.toBe(a);
    expect(hashToken(a)).toBe(hashToken(a));
    expect(hashToken(a)).not.toBe(a);
  });
});

describe("readCookie", () => {
  it("finds a cookie among several", () => {
    expect(readCookie("a=1; __Host-x=abc; b=2", "__Host-x")).toBe("abc");
    expect(readCookie("a=1", "missing")).toBeUndefined();
    expect(readCookie(undefined, "a")).toBeUndefined();
  });
});
