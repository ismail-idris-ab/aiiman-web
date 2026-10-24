import type { RequestHandler } from "express";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Rejects state-changing requests whose Origin isn't this host. Browsers always
 * send Origin on cross-site and same-site POSTs, so a missing header is refused
 * too. Defence in depth on top of the SameSite=Strict cookie.
 */
export const requireSameOrigin: RequestHandler = (req, res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();
  const origin = req.get("origin");
  const host = req.get("x-forwarded-host") ?? req.get("host");
  let originHost: string | undefined;
  try {
    originHost = origin === undefined ? undefined : new URL(origin).host;
  } catch {
    originHost = undefined;
  }
  if (originHost === undefined || host === undefined || originHost !== host) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
};
