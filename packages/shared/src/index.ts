/**
 * Content rules shared by the site, the admin and the API, so all three
 * validate posts the same way.
 */

import { z } from "zod";

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

export const MAX_BODY_BLOCKS = 2000;
const MAX_TEXT_LENGTH = 20_000;

// Tiptap JSON through an allowlist: unknown node types fail, unknown keys are stripped.
const textNode = z.object({
  type: z.literal("text"),
  text: z.string().min(1).max(MAX_TEXT_LENGTH),
});

const paragraphNode = z.object({
  type: z.literal("paragraph"),
  // Tiptap omits `content` on an empty paragraph.
  content: z.array(textNode).max(500).optional(),
});

export const docSchema = z.object({
  type: z.literal("doc"),
  content: z.array(paragraphNode).max(MAX_BODY_BLOCKS),
});

export type Doc = z.infer<typeof docSchema>;

export const slugSchema = z
  .string()
  .max(100, "Slug can be at most 100 characters")
  .regex(
    SLUG_PATTERN,
    "Use lowercase letters, numbers and hyphens, e.g. my-first-post",
  )
  .refine(
    (slug) => !(RESERVED_SLUGS as readonly string[]).includes(slug),
    "This slug is used by a site page. Choose another.",
  );

export const postInputSchema = z.object({
  title: z
    .string()
    .trim()
    .min(10, "Title needs at least 10 characters")
    .max(70, "Title can be at most 70 characters"),
  summary: z
    .string()
    .trim()
    .min(50, "Summary needs at least 50 characters")
    .max(160, "Summary can be at most 160 characters"),
  slug: slugSchema,
  body: docSchema,
});

export type PostInput = z.infer<typeof postInputSchema>;

export const POST_STATUSES = ["draft", "published"] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

/** A published post as the public endpoints return it. */
export const publicPostSchema = z.object({
  slug: z.string().regex(SLUG_PATTERN),
  title: z.string(),
  summary: z.string(),
  publishedAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  authorName: z.string(),
  body: docSchema,
});

export type PublicPost = z.infer<typeof publicPostSchema>;

export const publicPostListSchema = z.object({
  posts: z.array(publicPostSchema),
});

/** Plain text to a doc: blank lines separate paragraphs, other line breaks become spaces. */
export function textToDoc(text: string): Doc {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter((paragraph) => paragraph !== "");
  return {
    type: "doc",
    content: paragraphs.map((paragraph) => ({
      type: "paragraph",
      content: [{ type: "text", text: paragraph }],
    })),
  };
}

/** The doc's paragraphs as plain text, separated by blank lines. */
export function docToText(doc: Doc): string {
  return doc.content
    .map((paragraph) =>
      (paragraph.content ?? []).map((node) => node.text).join(""),
    )
    .filter((paragraph) => paragraph !== "")
    .join("\n\n");
}
