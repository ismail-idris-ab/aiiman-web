/** Auth for POST /api/revalidate. Pure, so it is unit-tested without Next. */

import { createHash, timingSafeEqual } from "node:crypto";

const digest = (value: string) => createHash("sha256").update(value).digest();

/** True when the header is exactly `Bearer <secret>`. Constant-time: hashing equalises lengths. */
export function isAuthorizedRevalidation(
  authorization: string | null,
  secret: string,
): boolean {
  if (authorization === null) return false;
  return timingSafeEqual(digest(authorization), digest(`Bearer ${secret}`));
}
