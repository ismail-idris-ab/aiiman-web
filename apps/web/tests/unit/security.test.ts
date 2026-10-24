import { EMBED_FRAME_ORIGINS } from "@aiiman/shared/embed";
import { describe, expect, it } from "vitest";

import { contentSecurityPolicy, securityHeaders } from "@/lib/security/headers";

describe("contentSecurityPolicy", () => {
  it("production policy never allows eval and upgrades insecure requests", () => {
    const csp = contentSecurityPolicy(false);
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).not.toContain("va.vercel-scripts.com");
    expect(csp).toContain("upgrade-insecure-requests");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain(`frame-src ${EMBED_FRAME_ORIGINS.join(" ")}`);
  });

  it("dev policy adds eval for React Refresh and the analytics debug CDN", () => {
    const csp = contentSecurityPolicy(true);
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain("https://va.vercel-scripts.com");
    expect(csp).not.toContain("upgrade-insecure-requests");
  });
});

describe("securityHeaders", () => {
  it("sends HSTS without preload and the full header set", () => {
    const headers = Object.fromEntries(
      securityHeaders(false).map((h) => [h.key, h.value]),
    );
    expect(headers["Strict-Transport-Security"]).toBe(
      "max-age=63072000; includeSubDomains",
    );
    expect(Object.keys(headers)).toEqual([
      "Content-Security-Policy",
      "Strict-Transport-Security",
      "X-Content-Type-Options",
      "X-Frame-Options",
      "Referrer-Policy",
      "Cross-Origin-Opener-Policy",
      "Permissions-Policy",
    ]);
  });
});
