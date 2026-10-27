import { z } from "zod";
import {
  countNodes,
  docImages,
  isBlurDataUrl,
  MAX_ALT_LENGTH,
  MAX_NODES,
  normaliseDoc,
} from "./doc.js";
import {
  ENTRY_TYPES,
  isBlobImageUrl,
  LANGS,
  MAX_FEATURED,
  MAX_TAGS,
  MIN_TAGS,
  REQUIRED_PAGES,
  RESERVED_SLUGS,
  SLUG_PATTERN,
  TAG_PATTERN,
} from "./vocab.js";

// Zod probes `new Function` to pick a faster parser; the admin's CSP (no
// 'unsafe-eval') blocks it and reports a violation even though Zod recovers.
z.config({ jitless: true });

/**
 * Any Tiptap JSON → the allowlisted Doc; unknown nodes, marks and attributes
 * are dropped. Drafts are saved with this; `docSchema` adds the rules for going live.
 */
export const draftDocSchema = z
  .unknown()
  .transform(normaliseDoc)
  .refine(
    (doc) => countNodes(doc) <= MAX_NODES,
    "This post is too long to save. Split it into parts.",
  );

export const docSchema = draftDocSchema.superRefine((doc, ctx) => {
  const missing = docImages(doc).flatMap((image, index) =>
    image.alt === "" ? [index + 1] : [],
  );
  if (missing.length > 0) {
    ctx.addIssue({
      code: "custom",
      message: `Add alt text to image ${missing.join(", ")}: describe it for readers who can't see it.`,
    });
  }
});

/** An uploaded image with its alt text, e.g. the cover. */
export const imageSchema = z.object({
  src: z
    .string()
    .refine(isBlobImageUrl, "Upload the image here instead of linking it"),
  alt: z
    .string()
    .trim()
    .min(1, "Add alt text: describe the image for readers who can't see it")
    .max(
      MAX_ALT_LENGTH,
      `Alt text can be at most ${MAX_ALT_LENGTH} characters`,
    ),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  blurDataURL: z.string().refine(isBlurDataUrl),
});

export type ImageInput = z.infer<typeof imageSchema>;

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
    /** Shown under the post header only; share previews use the generated card. */
    cover: imageSchema.optional(),
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

/**
 * What a draft may be saved with while it's being written: the same fields
 * and shapes as `postInputSchema`, without the rules a writer meets mid-sentence
 * (minimum lengths, slug and tag formats, alt text, date order). Images must
 * still be uploads. Previews and publishing check `postInputSchema`.
 */
export const draftInputSchema = z.object({
  title: z.string().trim().max(70, "Title can be at most 70 characters"),
  summary: z.string().trim().max(160, "Summary can be at most 160 characters"),
  slug: z.string().trim().max(100, "Slug can be at most 100 characters"),
  body: draftDocSchema,
  type: z.enum(ENTRY_TYPES, "Choose a type"),
  tags: z
    .array(z.string().trim().max(100, "Tags can be at most 100 characters"))
    .max(20, `Use at most ${MAX_TAGS} tags`),
  lang: z.enum(LANGS, "Choose a language"),
  date: calendarDateSchema.optional(),
  updated: calendarDateSchema.optional(),
  featured: z
    .number("Use a whole number")
    .int("Use a whole number")
    .min(1, "Featured positions start at 1")
    .max(MAX_FEATURED, `Featured positions go up to ${MAX_FEATURED}`)
    .optional(),
  canonical: z
    .string()
    .trim()
    .max(2000, "Canonical URL can be at most 2000 characters")
    .optional(),
  noindex: z.boolean(),
  cover: imageSchema
    .extend({
      alt: z
        .string()
        .trim()
        .max(
          MAX_ALT_LENGTH,
          `Alt text can be at most ${MAX_ALT_LENGTH} characters`,
        ),
    })
    .optional(),
});

/** A post's editable fields as stored: a draft may not meet the publishing rules yet. */
export type DraftInput = z.infer<typeof draftInputSchema>;

/** Optional input fields: an edit that leaves one out clears it. */
export const OPTIONAL_POST_FIELDS = [
  "date",
  "updated",
  "featured",
  "canonical",
  "cover",
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
  cover: imageSchema.optional(),
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
