/**
 * Builders for crawler-facing routes: robots.txt, sitemap.xml, llms.txt,
 * per-Entry Markdown and security.txt. Pure: content and origin are passed in.
 */

import type { MetadataRoute } from "next";

import type { Entry } from "#velite";

import type { ContentQueries } from "@/lib/content/queries";
import { MIN_ITEMS_FOR_INDEXED_TAG } from "@/lib/content/model";
import { isoDay } from "@/lib/dates";
import { siteConfig, type SiteConfig } from "@/site.config";

import { absoluteUrl, canonicalUrl, isIndexableEntry } from "./urls";

/**
 * Production allows everything except the API. Every other deploy (Vercel
 * previews) disallows all, alongside the `X-Robots-Tag` header from next.config.
 */
export function buildRobots(
  siteUrl: string,
  indexable: boolean,
): MetadataRoute.Robots {
  if (!indexable) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
    sitemap: absoluteUrl(siteUrl, "/sitemap.xml"),
  };
}

const newest = (dates: readonly string[]): string | undefined =>
  [...dates].sort().at(-1);

type Sitemap = MetadataRoute.Sitemap;

/**
 * Home, static pages, indexable Entries and tag pages with enough Items.
 * Never Links (external), `.md` routes, drafts, `noindex` or off-site-canonical Entries.
 */
export function buildSitemap(
  siteUrl: string,
  content: ContentQueries,
): Sitemap {
  const items = content.getItems();
  const lastItemChange = newest(items.map((item) => item.updated ?? item.date));
  const at = (path: string, lastModified?: string): Sitemap[number] => ({
    url: absoluteUrl(siteUrl, path),
    ...(lastModified === undefined
      ? {}
      : { lastModified: isoDay(lastModified) }),
  });

  const staticRoutes = [
    at("/", lastItemChange),
    at("/writing", lastItemChange),
    at("/projects"),
    at("/subscribe"),
  ];
  const pages = ["about", "uses", "privacy"].flatMap((slug) => {
    const page = content.getPage(slug);
    return page === undefined ? [] : [at(`/${slug}`, page.updated)];
  });
  const entries = content
    .getEntries()
    .filter((entry) => isIndexableEntry(siteUrl, entry))
    .map((entry) => at(entry.url, entry.updated ?? entry.date));
  const tags = content
    .getTags()
    .filter(({ count }) => count >= MIN_ITEMS_FOR_INDEXED_TAG)
    .map(({ tag }) =>
      at(
        `/tags/${tag}`,
        newest(content.getByTag(tag).map((item) => item.updated ?? item.date)),
      ),
    );

  return [...staticRoutes, ...pages, ...entries, ...tags];
}

/** llms.txt (llmstxt.org): site summary, then indexable Entries linked to their Markdown. */
export function buildLlmsTxt(siteUrl: string, content: ContentQueries): string {
  const entries = content
    .getEntries()
    .filter((entry) => isIndexableEntry(siteUrl, entry));
  const pages = (["about", "uses"] as const).flatMap((slug) => {
    const page = content.getPage(slug);
    return page === undefined
      ? []
      : [
          `- [${page.title}](${absoluteUrl(siteUrl, `/${slug}`)}): ${page.summary}`,
        ];
  });

  return [
    `# ${siteConfig.name}`,
    "",
    `> ${siteConfig.author.bio}`,
    "",
    `The public notebook of ${siteConfig.author.name}: essays, notes, tutorials and snippets, some in Hausa. Every entry below links to its Markdown version; the HTML page is the same URL without \`.md\`.`,
    "",
    "## Entries",
    "",
    ...(entries.length === 0
      ? ["No entries published yet."]
      : entries.map(
          (entry) =>
            `- [${entry.title}](${absoluteUrl(siteUrl, `${entry.url}.md`)}): ${entry.summary}`,
        )),
    ...(pages.length === 0 ? [] : ["", "## About", "", ...pages]),
    "",
  ].join("\n");
}

/** Plain Markdown of an Entry, served at `/<slug>.md`. */
export function buildEntryMarkdown(siteUrl: string, entry: Entry): string {
  return [
    `# ${entry.title}`,
    "",
    `> ${entry.summary}`,
    "",
    `- Author: ${siteConfig.author.name} (${absoluteUrl(siteUrl, "/about")})`,
    `- Published: ${isoDay(entry.date)}`,
    ...(entry.updated === undefined
      ? []
      : [`- Updated: ${isoDay(entry.updated)}`]),
    `- Language: ${entry.lang}`,
    `- Tags: ${entry.tags.join(", ")}`,
    `- Canonical: ${canonicalUrl(siteUrl, entry)}`,
    "",
    entry.raw.trim(),
    "",
  ].join("\n");
}

const SECURITY_TXT_VALIDITY_DAYS = 364;

/**
 * RFC 9116 security.txt. Contact is the email when set, else the X profile,
 * else the About page. Expires just under a year out (the RFC recommends less
 * than a year); the daily rebuild keeps it current.
 */
export function buildSecurityTxt(
  siteUrl: string,
  now: Date,
  config: Pick<SiteConfig, "email" | "socials"> = siteConfig,
): string {
  const contact =
    config.email === null
      ? (config.socials.x ?? absoluteUrl(siteUrl, "/about"))
      : `mailto:${config.email}`;
  const expires = new Date(
    now.getTime() + SECURITY_TXT_VALIDITY_DAYS * 24 * 60 * 60 * 1000,
  );
  expires.setUTCHours(0, 0, 0, 0);
  return [
    `Contact: ${contact}`,
    `Expires: ${expires.toISOString()}`,
    "Preferred-Languages: en",
    `Canonical: ${absoluteUrl(siteUrl, "/.well-known/security.txt")}`,
    "",
  ].join("\n");
}
