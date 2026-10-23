/**
 * Content vocabulary shared by the Velite config, build scripts and the app.
 * See GLOSSARY.md for what each term means.
 */

import { SLUG_PATTERN } from "@aiiman/shared";

export const ENTRY_TYPES = ["essay", "note", "tutorial", "snippet"] as const;
export const LINK_TYPES = ["video", "podcast", "talk", "guest-post"] as const;
export const ITEM_TYPES = [...ENTRY_TYPES, ...LINK_TYPES] as const;
export const LANGS = ["en", "ha"] as const;
export const PROJECT_STATUSES = [
  "live",
  "building",
  "paused",
  "archived",
] as const;

export type EntryType = (typeof ENTRY_TYPES)[number];
export type LinkType = (typeof LINK_TYPES)[number];
export type ItemType = (typeof ITEM_TYPES)[number];
export type Lang = (typeof LANGS)[number];
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

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

// Shared with the admin and the API so all three reserve the same slugs.
export { RESERVED_SLUGS, SLUG_PATTERN } from "@aiiman/shared";

export const TAG_PATTERN = SLUG_PATTERN;

/** A tag page is indexable once it lists at least this many Items. */
export const MIN_ITEMS_FOR_INDEXED_TAG = 3;
