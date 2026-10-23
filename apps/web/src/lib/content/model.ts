/**
 * Content vocabulary shared by the Velite config, build scripts and the app.
 * See GLOSSARY.md for what each term means.
 */

// Shared with the admin and the API so all three validate content the same way.
export {
  ENTRY_TYPES,
  ITEM_TYPES,
  LANG_LABELS,
  LANGS,
  LINK_TYPES,
  RESERVED_SLUGS,
  SLUG_PATTERN,
  TAG_PATTERN,
  TYPE_LABELS,
  type EntryType,
  type ItemType,
  type Lang,
  type LinkType,
} from "@aiiman/shared";

export const PROJECT_STATUSES = [
  "live",
  "building",
  "paused",
  "archived",
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/** A tag page is indexable once it lists at least this many Items. */
export const MIN_ITEMS_FOR_INDEXED_TAG = 3;
