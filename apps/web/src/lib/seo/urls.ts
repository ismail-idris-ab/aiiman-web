/** Pure URL helpers shared by metadata, JSON-LD, feeds and the sitemap. */

import type { Entry } from "#velite";

/** Absolute URL for a site path. The home path "/" maps to the bare origin (no trailing slash). */
export const absoluteUrl = (siteUrl: string, path: string): string =>
  path === "/" ? siteUrl : `${siteUrl}${path}`;

/** The URL search engines should treat as the original: the `canonical` override, else the Entry's own URL. */
export const canonicalUrl = (siteUrl: string, entry: Entry): string =>
  entry.canonical ?? absoluteUrl(siteUrl, entry.url);

/**
 * Whether an Entry belongs in the sitemap and llms.txt: not `noindex`, and not
 * first published elsewhere (a `canonical` pointing off-site).
 */
export const isIndexableEntry = (siteUrl: string, entry: Entry): boolean =>
  !entry.noindex &&
  (entry.canonical === undefined ||
    entry.canonical === absoluteUrl(siteUrl, entry.url));

/** Path of the generated share card for an Entry (see `src/app/[slug]/opengraph-image.tsx`). */
export const entryOgImagePath = (entry: Entry): string =>
  `${entry.url}/opengraph-image`;
