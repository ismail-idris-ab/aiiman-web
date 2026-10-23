/**
 * Content vocabulary shared by the site, the admin and the API.
 * See GLOSSARY.md for what each term means.
 */

export const ENTRY_TYPES = ["essay", "note", "tutorial", "snippet"] as const;
export const LINK_TYPES = ["video", "podcast", "talk", "guest-post"] as const;
export const ITEM_TYPES = [...ENTRY_TYPES, ...LINK_TYPES] as const;
export const LANGS = ["en", "ha"] as const;

export type EntryType = (typeof ENTRY_TYPES)[number];
export type LinkType = (typeof LINK_TYPES)[number];
export type ItemType = (typeof ITEM_TYPES)[number];
export type Lang = (typeof LANGS)[number];

export const TYPE_LABELS: Record<ItemType, string> = {
  essay: "Essay",
  note: "Note",
  tutorial: "Tutorial",
  snippet: "Snippet",
  video: "Video",
  podcast: "Podcast",
  talk: "Talk",
  "guest-post": "Guest post",
};

export const LANG_LABELS: Record<Lang, string> = { en: "English", ha: "Hausa" };

/** Top-level paths owned by site routes; no post slug may use them. */
export const RESERVED_SLUGS = [
  "about",
  "uses",
  "privacy",
  "projects",
  "writing",
  "tags",
  "subscribe",
  "search",
  "api",
  "rss.xml",
  "feed.json",
  "sitemap.xml",
  "robots.txt",
  "llms.txt",
  "static",
  "_next",
  "md",
  // Generated metadata routes (src/app/icon.tsx etc.).
  "icon",
  "apple-icon",
  "opengraph-image",
  "manifest.webmanifest",
  ".well-known",
] as const;

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const TAG_PATTERN = SLUG_PATTERN;

export const MIN_TAGS = 1;
export const MAX_TAGS = 5;
/** "Start here" positions on the home page. */
export const MAX_FEATURED = 12;
/** Titles past this length may be cut off in search results (a warning, not an error). */
export const TITLE_WARN_LENGTH = 60;

/** Pages every published page links to (nav, footer, bylines, Person JSON-LD, newsletter consent). */
export const REQUIRED_PAGES = ["about", "privacy"] as const;

/** Calendar dates (publication, scheduling) are read in West Africa Time. */
export const CONTENT_TIME_ZONE = "Africa/Lagos";
