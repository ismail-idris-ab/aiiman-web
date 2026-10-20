/** RSS 2.0 and JSON Feed 1.1 builders. Pure: items and origin are passed in. */

import type { Item } from "@/lib/content/queries";
import { siteConfig } from "@/site.config";

import { FEEDS } from "./metadata";
import { absoluteUrl } from "./urls";

/** The feeds carry the newest Items, Entries and Links together. */
export const FEED_ITEM_LIMIT = 30;

const FEED_DESCRIPTION = `Essays, notes, tutorials and talks by ${siteConfig.author.name}.`;

/** Absolute permalink: the Entry page, or the Link's external URL. */
const itemUrl = (siteUrl: string, item: Item) =>
  item.kind === "entry" ? absoluteUrl(siteUrl, item.url) : item.externalUrl;

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Most recent change across the items, so the output only changes when content does. */
const lastChange = (items: readonly Item[]): string | undefined =>
  items
    .map((item) => item.updated ?? item.date)
    .sort()
    .at(-1);

export function buildRss(siteUrl: string, items: readonly Item[]): string {
  const latest = lastChange(items);
  const entries = items.map((item) => {
    const url = itemUrl(siteUrl, item);
    const categories = item.tags
      .map((tag) => `      <category>${escapeXml(tag)}</category>`)
      .join("\n");
    return [
      "    <item>",
      `      <title>${escapeXml(item.title)}</title>`,
      `      <link>${escapeXml(url)}</link>`,
      `      <guid isPermaLink="true">${escapeXml(url)}</guid>`,
      `      <pubDate>${new Date(item.date).toUTCString()}</pubDate>`,
      `      <description>${escapeXml(item.summary)}</description>`,
      `      <dc:creator>${escapeXml(siteConfig.author.name)}</dc:creator>`,
      categories,
      "    </item>",
    ]
      .filter((line) => line !== "")
      .join("\n");
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">',
    "  <channel>",
    `    <title>${escapeXml(siteConfig.name)}</title>`,
    `    <link>${escapeXml(siteUrl)}</link>`,
    `    <description>${escapeXml(FEED_DESCRIPTION)}</description>`,
    `    <language>${siteConfig.lang}</language>`,
    `    <atom:link href="${escapeXml(absoluteUrl(siteUrl, FEEDS.rss.path))}" rel="self" type="${FEEDS.rss.type}"/>`,
    ...(latest === undefined
      ? []
      : [
          `    <lastBuildDate>${new Date(latest).toUTCString()}</lastBuildDate>`,
        ]),
    ...entries,
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");
}

interface JsonFeedItem {
  id: string;
  url: string;
  external_url?: string;
  title: string;
  summary: string;
  content_text: string;
  date_published: string;
  date_modified?: string;
  tags: string[];
  language: string;
}

export interface JsonFeed {
  version: "https://jsonfeed.org/version/1.1";
  title: string;
  home_page_url: string;
  feed_url: string;
  description: string;
  language: string;
  authors: Array<{ name: string; url: string }>;
  items: JsonFeedItem[];
}

export function buildJsonFeed(siteUrl: string, items: readonly Item[]): string {
  const feed: JsonFeed = {
    version: "https://jsonfeed.org/version/1.1",
    title: siteConfig.name,
    home_page_url: siteUrl,
    feed_url: absoluteUrl(siteUrl, FEEDS.json.path),
    description: FEED_DESCRIPTION,
    language: siteConfig.lang,
    authors: [
      {
        name: siteConfig.author.name,
        url: absoluteUrl(siteUrl, "/about"),
      },
    ],
    items: items.map((item) => {
      const url = itemUrl(siteUrl, item);
      return {
        id: url,
        url,
        ...(item.kind === "link" ? { external_url: item.externalUrl } : {}),
        title: item.title,
        summary: item.summary,
        content_text: item.summary,
        date_published: item.date,
        ...(item.updated === undefined ? {} : { date_modified: item.updated }),
        tags: [...item.tags],
        language: item.lang,
      };
    }),
  };
  return `${JSON.stringify(feed, null, 2)}\n`;
}
