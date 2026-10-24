import { randomUUID } from "node:crypto";
import { Router, type Request, type RequestHandler } from "express";
import { z } from "zod";
import type { Logger } from "../app.js";
import {
  clearedSessionCookie,
  readCookie,
  SESSION_COOKIE,
  sessionCookie,
} from "../http/cookies.js";
import {
  normaliseEmail,
  toPublicUser,
  type Stores,
  type User,
} from "../store.js";
import type { LoginLimiter } from "./limiter.js";
import {
  MAX_PASSWORD_LENGTH,
  verifyAgainstDummy,
  verifyPassword,
} from "./password.js";
import { hashToken, newToken } from "./tokens.js";

export const SESSION_DAYS = 7;
const SESSION_SECONDS = SESSION_DAYS * 24 * 60 * 60;

export interface AuthDeps {
  getStores: () => Promise<Stores>;
  limiter: LoginLimiter;
  log: Logger;
  now: () => Date;
}

const loginSchema = z.object({
  email: z.string().trim().pipe(z.email().max(254)),
  password: z.string().min(1).max(MAX_PASSWORD_LENGTH),
});

const INVALID_LOGIN = "Email or password is incorrect";
const TOO_MANY = "Too many attempts. Try again in 15 minutes.";

export function clientIp(req: Request): string {
  const forwarded = req.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (
    req.get("x-real-ip") ?? forwarded ?? req.socket.remoteAddress ?? "unknown"
  );
}

/** Resolves the signed-in user from the session cookie, or null. */
export async function currentUser(
  req: Request,
  { getStores, now }: Pick<AuthDeps, "getStores" | "now">,
): Promise<User | null> {
  const token = readCookie(req.get("cookie"), SESSION_COOKIE);
  if (token === undefined || token === "") return null;
  const stores = await getStores();
  const session = await stores.sessions.findValid(hashToken(token), now());
  if (session === null) return null;
  const user = await stores.users.findById(session.userId);
  return user?.status === "active" ? user : null;
}

/** 401 unless signed in; puts the user in res.locals.user. Responses are never cached. */
export function requireUser(
  deps: Pick<AuthDeps, "getStores" | "now">,
): RequestHandler {
  return async (req, res, next) => {
    const user = await currentUser(req, deps);
    if (user === null) {
      res.status(401).json({ error: "Not signed in" });
      return;
    }
    res.locals.user = user;
    res.set("Cache-Control", "no-store");
    next();
  };
}

export function authRouter(deps: AuthDeps): Router {
  const { getStores, limiter, log, now } = deps;
  const router = Router();

  const login: RequestHandler = async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Enter your email and password" });
      return;
    }
    const email = normaliseEmail(parsed.data.email);
    const ipKey = `ip:${clientIp(req)}`;
    const accountKey = `account:${hashToken(email)}`;

    if (
      (await limiter.isLocked(ipKey)) ||
      (await limiter.isLocked(accountKey))
    ) {
      log("auth.login_locked");
      res.status(429).json({ error: TOO_MANY });
      return;
    }

    const stores = await getStores();
    const user = await stores.users.findByEmail(email);
    const valid =
      user === null
        ? await verifyAgainstDummy(parsed.data.password)
        : await verifyPassword(user.passwordHash, parsed.data.password);

    if (user === null || !valid || user.status !== "active") {
      await limiter.recordFailure(ipKey);
      await limiter.recordFailure(accountKey);
      log("auth.login_failed");
      res.status(401).json({ error: INVALID_LOGIN });
      return;
    }

    await limiter.reset(accountKey);
    const token = newToken();
    const createdAt = now();
    await stores.sessions.insert({
      tokenHash: hashToken(token),
      userId: user.id,
      createdAt,
      expiresAt: new Date(createdAt.getTime() + SESSION_SECONDS * 1000),
    });
    log("auth.login_succeeded", { userId: user.id });
    res
      .set("Set-Cookie", sessionCookie(token, SESSION_SECONDS))
      .json({ user: toPublicUser(user) });
  };

  const logout: RequestHandler = async (req, res) => {
    const token = readCookie(req.get("cookie"), SESSION_COOKIE);
    if (token !== undefined && token !== "") {
      const stores = await getStores();
      await stores.sessions.delete(hashToken(token));
    }
    res.set("Set-Cookie", clearedSessionCookie()).status(204).end();
  };

  const me: RequestHandler = async (req, res) => {
    const user = await currentUser(req, deps);
    if (user === null) {
      res.status(401).json({ error: "Not signed in" });
      return;
    }
    res.set("Cache-Control", "no-store").json({ user: toPublicUser(user) });
  };

  router.post("/login", login);
  router.post("/logout", logout);
  router.get("/me", me);
  return router;
}

export function newUserId(): string {
  return randomUUID();
}
