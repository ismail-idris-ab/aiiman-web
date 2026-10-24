/**
 * Security headers applied to every route by `next.config.ts`.
 * Dependency-free so the config can import it.
 *
 * CSP is a source allowlist with `'unsafe-inline'` (no nonce) so pages stay
 * statically generated; see the Decisions log. `'unsafe-eval'` is added only
 * in `next dev`, where React Refresh needs it.
 */

export interface Header {
  key: string;
  value: string;
}

/** Vercel Analytics/Speed Insights load their debug scripts from here in `next dev` only; production uses same-origin `/_vercel/*`. */
const VERCEL_SCRIPTS_DEV = "https://va.vercel-scripts.com";

export function contentSecurityPolicy(dev: boolean): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      "'unsafe-inline'",
      ...(dev ? ["'unsafe-eval'", VERCEL_SCRIPTS_DEV] : []),
    ],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", "https://i.ytimg.com"],
    "font-src": ["'self'"],
    "connect-src": ["'self'", ...(dev ? [VERCEL_SCRIPTS_DEV] : [])],
    // Embeds load only after the reader taps; must equal EMBED_FRAME_ORIGINS in @aiiman/shared.
    "frame-src": [
      "https://www.youtube-nocookie.com",
      "https://platform.twitter.com",
      "https://www.tiktok.com",
      "https://www.instagram.com",
      "https://gist.github.com",
    ],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  const policy = Object.entries(directives).map(
    ([name, sources]) => `${name} ${sources.join(" ")}`,
  );
  // Dev runs on plain http://localhost; upgrading would break it.
  if (!dev) policy.push("upgrade-insecure-requests");
  return policy.join("; ");
}

export const securityHeaders = (dev: boolean): Header[] => [
  { key: "Content-Security-Policy", value: contentSecurityPolicy(dev) },
  // No `preload`: hard to undo; owner decides after launch.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
];
