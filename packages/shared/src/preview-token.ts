/**
 * Short-lived tokens that let the site render one post in draft mode. The API
 * signs them, the site verifies them; both hold SITE_API_SECRET. Node-only,
 * so it is a separate entry point the admin bundle never imports.
 */

import { Buffer } from "node:buffer";
import { createHmac, timingSafeEqual } from "node:crypto";

export const PREVIEW_TOKEN_SECONDS = 15 * 60;

const sign = (secret: string, postId: string, expires: number) =>
  createHmac("sha256", secret)
    .update(`preview:${postId}:${expires}`)
    .digest("base64url");

/** `<postId>.<expires (unix seconds)>.<signature>`. */
export function createPreviewToken(
  postId: string,
  secret: string,
  now: Date,
): string {
  const expires = Math.floor(now.getTime() / 1000) + PREVIEW_TOKEN_SECONDS;
  return `${postId}.${expires}.${sign(secret, postId, expires)}`;
}

export interface VerifiedPreviewToken {
  postId: string;
  expires: Date;
}

/** The token's post and expiry, or null when malformed, forged or expired. */
export function verifyPreviewToken(
  token: string,
  secret: string,
  now: Date,
): VerifiedPreviewToken | null {
  const [postId, expiresText, signature, ...rest] = token.split(".");
  if (
    postId === undefined ||
    postId === "" ||
    expiresText === undefined ||
    !/^\d{1,12}$/.test(expiresText) ||
    signature === undefined ||
    rest.length > 0
  ) {
    return null;
  }
  const expires = Number(expiresText);
  const expected = Buffer.from(sign(secret, postId, expires));
  const actual = Buffer.from(signature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return null;
  }
  if (expires * 1000 <= now.getTime()) return null;
  return { postId, expires: new Date(expires * 1000) };
}
