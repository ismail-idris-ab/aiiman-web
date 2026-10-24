import { createHash, randomBytes } from "node:crypto";

/** 256-bit random token for the session cookie. */
export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Only the hash is stored, so a database leak doesn't hand out live sessions. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}
