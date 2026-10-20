/**
 * Metadata builders. Next merges metadata shallowly, so a page that sets
 * `alternates` or `openGraph` replaces the layout's copy entirely; every
 * builder therefore returns the full set (canonical + feeds, OG, Twitter).
 * Share images come from the `opengraph-image` file next to each route,
 * which Next always prefers over config-based images.
 */

import type { Metadata } from "next";

import type { Entry } from "#velite";

import type { Lang } from "@/lib/content/model";
import { siteConfig } from "@/site.config";

import { absoluteUrl } from "./urls";

export const FEEDS = {
  rss: {
    path: "/rss.xml",
    type: "application/rss+xml",
    title: `${siteConfig.name} (RSS)`,
  },
  json: {
    path: "/feed.json",
    type: "application/feed+json",
    title: `${siteConfig.name} (JSON Feed)`,
  },
} as const;

/** `<link rel="alternate">` for both feeds; included on every page. */
export const feedAlternates = {
  [FEEDS.rss.type]: [{ url: FEEDS.rss.path, title: FEEDS.rss.title }],
  [FEEDS.json.type]: [{ url: FEEDS.json.path, title: FEEDS.json.title }],
};

const OG_LOCALES: Record<Lang, string> = { en: "en_GB", ha: "ha_NG" };

const twitter = {
  card: "summary_large_image",
  site: siteConfig.twitterHandle,
  creator: siteConfig.twitterHandle,
} as const;

export interface PageSeo {
  /** Page title; the layout template appends the site name unless `absoluteTitle`. */
  title: string;
  description: string;
  /** Site path, e.g. "/writing". Becomes the self-referencing canonical. */
  path: string;
  absoluteTitle?: boolean;
  noindex?: boolean;
}

export function pageMetadata({
  title,
  description,
  path,
  absoluteTitle = false,
  noindex = false,
}: PageSeo): Metadata {
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: path, types: feedAlternates },
    openGraph: {
      type: "website",
      url: path,
      title,
      description,
      siteName: siteConfig.name,
      locale: OG_LOCALES.en,
    },
    twitter,
    ...(noindex ? { robots: { index: false, follow: true } } : {}),
  };
}

/**
 * Entry metadata: article Open Graph fields, the `canonical` override,
 * `noindex`, and hreflang alternates when an EN/HA pair exists.
 */
export function entryMetadata(
  siteUrl: string,
  entry: Entry,
  translation: Entry | undefined,
): Metadata {
  const pair =
    translation === undefined
      ? undefined
      : entry.lang === "en"
        ? { en: entry, ha: translation }
        : { en: translation, ha: entry };

  return {
    title: entry.title,
    description: entry.summary,
    alternates: {
      canonical: entry.canonical ?? entry.url,
      types: feedAlternates,
      ...(pair === undefined
        ? {}
        : {
            languages: {
              en: pair.en.url,
              ha: pair.ha.url,
              "x-default": pair.en.url,
            },
          }),
    },
    openGraph: {
      type: "article",
      url: entry.url,
      title: entry.title,
      description: entry.summary,
      siteName: siteConfig.name,
      locale: OG_LOCALES[entry.lang],
      publishedTime: entry.date,
      modifiedTime: entry.updated ?? entry.date,
      authors: [absoluteUrl(siteUrl, "/about")],
      tags: entry.tags,
    },
    twitter,
    ...(entry.noindex ? { robots: { index: false, follow: true } } : {}),
  };
}
