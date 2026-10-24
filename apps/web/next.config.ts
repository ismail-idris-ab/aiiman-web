import { existsSync, readFileSync } from "node:fs";

import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

import { securityHeaders } from "./src/lib/security/headers";
import { isIndexableDeploy } from "./src/lib/seo/deploy";

const ENTRIES_JSON = ".velite/entries.json";

/** Old slug → current slug, from each Entry's `redirectFrom` (validated at content build). */
function entryRedirects(): NonNullable<
  Awaited<ReturnType<NonNullable<NextConfig["redirects"]>>>
> {
  if (!existsSync(ENTRIES_JSON)) return [];
  const entries = JSON.parse(readFileSync(ENTRIES_JSON, "utf8")) as Array<{
    slug: string;
    redirectFrom: string[];
  }>;
  return entries.flatMap((entry) =>
    entry.redirectFrom.flatMap((old) => [
      { source: `/${old}`, destination: `/${entry.slug}`, permanent: true },
      {
        source: `/${old}.md`,
        destination: `/${entry.slug}.md`,
        permanent: true,
      },
    ]),
  );
}

export default async function config(phase: string): Promise<NextConfig> {
  // Velite's webpack plugin breaks under Turbopack; its docs recommend starting it from next.config.
  // Production builds run `velite build` as a separate script step instead.
  if (
    phase === PHASE_DEVELOPMENT_SERVER &&
    process.env.VELITE_STARTED !== "1"
  ) {
    process.env.VELITE_STARTED = "1";
    const { build } = await import("velite");
    // Non-strict in dev: content errors are logged without killing the dev server.
    await build({ watch: true, clean: false, strict: false });
  }

  return {
    poweredByHeader: false,
    trailingSlash: false,
    images: {
      remotePatterns: [
        { protocol: "https", hostname: "i.ytimg.com", pathname: "/vi/**" },
        // Admin uploads (IMAGE_PATH_PREFIX in @aiiman/shared); posts accept no other remote images.
        {
          protocol: "https",
          hostname: "*.public.blob.vercel-storage.com",
          pathname: "/images/**",
        },
      ],
    },
    redirects: async () => entryRedirects(),
    // `/<slug>.md` is served by the route handler at src/app/md/[slug].
    rewrites: async () => [
      { source: "/:slug([a-z0-9-]+)\\.md", destination: "/md/:slug" },
    ],
    headers: async () => [
      {
        source: "/:path*",
        headers: [
          ...securityHeaders(phase === PHASE_DEVELOPMENT_SERVER),
          // Preview deploys must never be indexed (robots.txt disallows too).
          ...(isIndexableDeploy(process.env.VERCEL_ENV)
            ? []
            : [{ key: "X-Robots-Tag", value: "noindex, nofollow" }]),
        ],
      },
    ],
    turbopack: {
      rules: {
        "*.css": {
          loaders: ["@tailwindcss/turbopack"],
          as: "*.css",
        },
      },
    },
  };
}
