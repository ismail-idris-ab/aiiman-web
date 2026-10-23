import { z } from "zod";
import { docSchema } from "./doc.js";
import {
  ENTRY_TYPES,
  LANGS,
  MAX_FEATURED,
  MAX_TAGS,
  MIN_TAGS,
  REQUIRED_PAGES,
  RESERVED_SLUGS,
  SLUG_PATTERN,
  TAG_PATTERN,
} from "./vocab.js";

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

const tagsSchema = z
  .array(
    z
      .string()
      .regex(
        TAG_PATTERN,
        "Tags use lowercase letters, numbers and hyphens, e.g. react-native",
      ),
  )
  .min(MIN_TAGS, "Add at least one tag")
  .max(MAX_TAGS, `Use at most ${MAX_TAGS} tags`)
  .refine((tags) => new Set(tags).size === tags.length, "Remove repeated tags");

/** A calendar date (YYYY-MM-DD), read in the site's time zone. */
const calendarDateSchema = z.iso.date("Use a date like 2026-10-22");

const httpsUrl = z.url({
  protocol: /^https$/,
  error: "Use a full https:// address",
});

/** The fields a writer edits. Optional fields are absent (not null) when unset. */
export const postInputSchema = z
  .object({
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
    type: z.enum(ENTRY_TYPES, "Choose a type"),
    tags: tagsSchema,
    lang: z.enum(LANGS, "Choose a language"),
    /** Publication date. Empty on a draft; set to today when published without one. */
    date: calendarDateSchema.optional(),
    updated: calendarDateSchema.optional(),
    featured: z
      .number("Use a whole number")
      .int("Use a whole number")
      .min(1, "Featured positions start at 1")
      .max(MAX_FEATURED, `Featured positions go up to ${MAX_FEATURED}`)
      .optional(),
    canonical: httpsUrl.optional(),
    noindex: z.boolean(),
  })
  .superRefine((post, ctx) => {
    if (post.updated === undefined) return;
    if (post.date === undefined) {
      ctx.addIssue({
        code: "custom",
        message: "Set the publication date before an updated date",
        path: ["updated"],
      });
    } else if (post.updated < post.date) {
      ctx.addIssue({
        code: "custom",
        message: "Updated date must be on or after the publication date",
        path: ["updated"],
      });
    }
  });

export type PostInput = z.infer<typeof postInputSchema>;

/** Optional input fields: an edit that leaves one out clears it. */
export const OPTIONAL_POST_FIELDS = [
  "date",
  "updated",
  "featured",
  "canonical",
] as const satisfies ReadonlyArray<keyof PostInput>;

export const POST_STATUSES = ["draft", "published"] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

/** A published post as the public endpoints return it. */
export const publicPostSchema = z.object({
  slug: z.string().regex(SLUG_PATTERN),
  title: z.string(),
  summary: z.string(),
  type: z.enum(ENTRY_TYPES),
  tags: z.array(z.string().regex(TAG_PATTERN)),
  lang: z.enum(LANGS),
  date: z.iso.date(),
  updated: z.iso.date().optional(),
  featured: z.number().int().optional(),
  canonical: httpsUrl.optional(),
  noindex: z.boolean(),
  publishedAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  authorName: z.string(),
  body: docSchema,
});

export type PublicPost = z.infer<typeof publicPostSchema>;

export const publicPostListSchema = z.object({
  posts: z.array(publicPostSchema),
});

/** Any post, for the site's draft preview. A draft without a date previews as today. */
export const previewPostSchema = publicPostSchema.extend({
  status: z.enum(POST_STATUSES),
});

export type PreviewPost = z.infer<typeof previewPostSchema>;

/**
 * Required pages that are not published yet. `publishedPages` is null while
 * pages still live in the site's MDX, whose build enforces the same rule.
 */
export function missingRequiredPages(
  publishedPages: readonly string[] | null,
): string[] {
  if (publishedPages === null) return [];
  return REQUIRED_PAGES.filter((slug) => !publishedPages.includes(slug));
}
