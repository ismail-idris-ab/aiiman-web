import { randomUUID } from "node:crypto";
import { PASSWORD_LINK_HOURS, passwordSchema } from "@aiiman/shared";
import {
  Router,
  type Request,
  type RequestHandler,
  type Response,
} from "express";
import { z } from "zod";
import type { Logger } from "../app.js";
import {
  clearedSessionCookie,
  readCookie,
  SESSION_COOKIE,
  sessionCookie,
} from "../http/cookies.js";
import { fieldErrors } from "../http/fields.js";
import {
  normaliseEmail,
  toPublicUser,
  type PasswordLink,
  type PasswordLinkKind,
  type Stores,
  type User,
} from "../store.js";
import type { LoginLimiter } from "./limiter.js";
import {
  hashPassword,
  MAX_PASSWORD_LENGTH,
  verifyAgainstDummy,
  verifyPassword,
} from "./password.js";
import { userOf } from "./policy.js";
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

// Tokens are 256-bit base64url; anything else can't be one.
const tokenSchema = z.string().regex(/^[\w-]{43}$/);
const linkSchema = z.object({ token: tokenSchema });
const useLinkSchema = z.object({
  token: tokenSchema,
  password: passwordSchema,
});
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(MAX_PASSWORD_LENGTH),
  newPassword: passwordSchema,
});

const INVALID_LOGIN = "Email or password is incorrect";
const TOO_MANY = "Too many attempts. Try again in 15 minutes.";
const LINK_INVALID =
  "This link has expired or was already used. Ask an admin for a new one.";
const WRONG_PASSWORD = "That isn't your current password";

export function clientIp(req: Request): string {
  const forwarded = req.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (
    req.get("x-real-ip") ?? forwarded ?? req.socket.remoteAddress ?? "unknown"
  );
}

function sessionToken(req: Request): string | undefined {
  const token = readCookie(req.get("cookie"), SESSION_COOKIE);
  return token === "" ? undefined : token;
}

/** Resolves the signed-in user from the session cookie, or null. */
export async function currentUser(
  req: Request,
  { getStores, now }: Pick<AuthDeps, "getStores" | "now">,
): Promise<User | null> {
  const token = sessionToken(req);
  if (token === undefined) return null;
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

/** A new setup or reset link for `user`; any older link of theirs stops working. */
export async function createPasswordLink(
  stores: Stores,
  user: User,
  at: Date,
): Promise<{ token: string; kind: PasswordLinkKind; expiresAt: Date }> {
  await stores.passwordLinks.deleteByUser(user.id);
  const token = newToken();
  const link: PasswordLink = {
    tokenHash: hashToken(token),
    userId: user.id,
    kind: user.passwordHash === null ? "setup" : "reset",
    createdAt: at,
    expiresAt: new Date(at.getTime() + PASSWORD_LINK_HOURS * 60 * 60 * 1000),
  };
  await stores.passwordLinks.insert(link);
  return { token, kind: link.kind, expiresAt: link.expiresAt };
}

export function authRouter(deps: AuthDeps): Router {
  const { getStores, limiter, log, now } = deps;
  const router = Router();

  /** Signs `user` in on this device: a new session and its cookie. */
  const startSession = async (res: Response, user: User) => {
    const stores = await getStores();
    const token = newToken();
    const createdAt = now();
    await stores.sessions.insert({
      tokenHash: hashToken(token),
      userId: user.id,
      createdAt,
      expiresAt: new Date(createdAt.getTime() + SESSION_SECONDS * 1000),
    });
    res
      .set("Set-Cookie", sessionCookie(token, SESSION_SECONDS))
      .set("Cache-Control", "no-store")
      .json({ user: toPublicUser(user) });
  };

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
    // A user who hasn't used their setup link has no password to match.
    const valid =
      user === null || user.passwordHash === null
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
    log("auth.login_succeeded", { userId: user.id });
    await startSession(res, user);
  };

  const logout: RequestHandler = async (req, res) => {
    const token = sessionToken(req);
    if (token !== undefined) {
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

  /** The link's owner, if the link is live and they may still sign in. */
  const linkOwner = async (link: PasswordLink | null) => {
    if (link === null) return null;
    const stores = await getStores();
    const user = await stores.users.findById(link.userId);
    return user?.status === "active" ? user : null;
  };

  /** Says whether a setup or reset link still works, before the user types a password. */
  const checkLink: RequestHandler = async (req, res) => {
    res.set("Cache-Control", "no-store");
    const parsed = linkSchema.safeParse(req.body);
    const stores = await getStores();
    const link = parsed.success
      ? await stores.passwordLinks.find(hashToken(parsed.data.token), now())
      : null;
    const user = await linkOwner(link);
    if (link === null || user === null) {
      res.status(404).json({ error: LINK_INVALID });
      return;
    }
    res.json({ kind: link.kind, name: user.name });
  };

  /**
   * Sets the password from a setup or reset link. The link works once; every
   * other session of the user ends, and this device is signed in.
   */
  const useLink: RequestHandler = async (req, res) => {
    res.set("Cache-Control", "no-store");
    const parsed = useLinkSchema.safeParse(req.body);
    if (!parsed.success) {
      const fields = fieldErrors(parsed.error);
      if ("token" in fields) {
        res.status(404).json({ error: LINK_INVALID });
      } else {
        res.status(400).json({ error: "Choose a longer password", fields });
      }
      return;
    }
    const stores = await getStores();
    const link = await stores.passwordLinks.consume(
      hashToken(parsed.data.token),
      now(),
    );
    const owner = await linkOwner(link);
    if (link === null || owner === null) {
      log("auth.password_link_invalid");
      res.status(404).json({ error: LINK_INVALID });
      return;
    }
    const user = await stores.users.update(owner.id, {
      passwordHash: await hashPassword(parsed.data.password),
    });
    if (user === null) {
      res.status(404).json({ error: LINK_INVALID });
      return;
    }
    await stores.sessions.deleteByUser(user.id);
    log("auth.password_link_used", { userId: user.id, kind: link.kind });
    await startSession(res, user);
  };

  /** Changes your own password; your other devices are signed out. */
  const changePassword: RequestHandler = async (req, res) => {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Check the highlighted fields",
        fields: fieldErrors(parsed.error),
      });
      return;
    }
    const user = userOf(res);
    // Someone at an unlocked device mustn't get unlimited guesses either.
    const key = `password:${user.id}`;
    if (await limiter.isLocked(key)) {
      res.status(429).json({ error: TOO_MANY });
      return;
    }
    const valid =
      user.passwordHash !== null &&
      (await verifyPassword(user.passwordHash, parsed.data.currentPassword));
    if (!valid) {
      await limiter.recordFailure(key);
      log("auth.password_change_failed", { userId: user.id });
      res.status(400).json({
        error: WRONG_PASSWORD,
        fields: { currentPassword: WRONG_PASSWORD },
      });
      return;
    }
    await limiter.reset(key);
    const stores = await getStores();
    await stores.users.update(user.id, {
      passwordHash: await hashPassword(parsed.data.newPassword),
    });
    const token = sessionToken(req);
    await stores.sessions.deleteByUser(
      user.id,
      token === undefined ? undefined : hashToken(token),
    );
    log("auth.password_changed", { userId: user.id });
    res.status(204).end();
  };

  router.post("/login", login);
  router.post("/logout", logout);
  router.get("/me", me);
  router.post("/password-link", checkLink);
  router.post("/password-link/use", useLink);
  router.post("/password", requireUser(deps), changePassword);
  return router;
}

export function newUserId(): string {
  return randomUUID();
}
