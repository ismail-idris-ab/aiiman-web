/**
 * Content vocabulary shared by the site, the admin and the API.
 * See GLOSSARY.md for what each term means. No dependencies: the site's
 * client components import it via `@aiiman/shared/vocab`, and Zod in the
 * browser would trip the CSP (it probes `new Function`) and add weight.
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

/** Calendar date (YYYY-MM-DD) of `now` in the given IANA time zone. */
export function calendarDate(now: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * Languages a code block can be highlighted as (Shiki ids), with editor
 * labels. Anything else is stored and rendered as plain text.
 */
export const CODE_LANGUAGES = {
  plaintext: "Plain text",
  bash: "Bash",
  shell: "Shell session",
  typescript: "TypeScript",
  tsx: "TSX",
  javascript: "JavaScript",
  jsx: "JSX",
  json: "JSON",
  html: "HTML",
  css: "CSS",
  markdown: "Markdown",
  mdx: "MDX",
  yaml: "YAML",
  toml: "TOML",
  sql: "SQL",
  graphql: "GraphQL",
  python: "Python",
  go: "Go",
  rust: "Rust",
  java: "Java",
  kotlin: "Kotlin",
  swift: "Swift",
  dart: "Dart",
  php: "PHP",
  ruby: "Ruby",
  c: "C",
  cpp: "C++",
  csharp: "C#",
  dockerfile: "Dockerfile",
  diff: "Diff",
  nginx: "Nginx",
  prisma: "Prisma",
} as const;

export type CodeLanguage = keyof typeof CODE_LANGUAGES;

export const isCodeLanguage = (value: unknown): value is CodeLanguage =>
  typeof value === "string" && Object.hasOwn(CODE_LANGUAGES, value);

/** Image types the API accepts for upload. */
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];

/** Largest upload, under Vercel's 4.5 MB request body limit for functions. */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

/** Longest side of a stored image; larger uploads are scaled down. */
export const MAX_IMAGE_SIDE = 2400;

/** Uploaded images are public Vercel Blob objects under this path. */
export const IMAGE_PATH_PREFIX = "/images/";

const BLOB_HOST = /^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/;

/** A plain https URL of an image this site uploaded to Vercel Blob, and nothing else. */
export function isBlobImageUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 512) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return (
    url.protocol === "https:" &&
    url.username === "" &&
    url.password === "" &&
    url.port === "" &&
    BLOB_HOST.test(url.hostname) &&
    url.pathname.startsWith(IMAGE_PATH_PREFIX) &&
    url.search === "" &&
    url.hash === "" &&
    // Only the canonical spelling: no encoded tricks the browser reads differently.
    url.href === value
  );
}
