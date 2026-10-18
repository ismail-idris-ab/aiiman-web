import { writeFileSync } from "node:fs";
import { relative } from "node:path";

import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypePrettyCode, {
  type Options as PrettyCodeOptions,
} from "rehype-pretty-code";
import rehypeSlug from "rehype-slug";
import {
  defineCollection,
  defineConfig,
  logger,
  s,
  type ZodMeta,
} from "velite";

import {
  ENTRY_TYPES,
  LANGS,
  LINK_TYPES,
  PROJECT_STATUSES,
  TAG_PATTERN,
} from "./src/lib/content/model";
import { remarkContent } from "./src/lib/content/remark-content";
import {
  findCollectionIssues,
  stripMdxComments,
} from "./src/lib/content/rules";
import { visibilityModeFor } from "./src/lib/content/visibility";
import { buildSearchIndex } from "./src/lib/search-index";
import { missingSiteConfigFields, siteConfig } from "./src/site.config";

const output = {
  data: ".velite",
  assets: "public/static",
  base: "/static/",
  name: "[name]-[hash:8].[ext]",
} as const;

const prettyCode: PrettyCodeOptions = {
  theme: { light: "github-light", dark: "github-dark" },
  keepBackground: false,
  defaultLang: "plaintext",
};

/** Repo-relative source path, used to name files in build errors. */
const sourceOf = (meta: ZodMeta) =>
  relative(process.cwd(), meta.path).replaceAll("\\", "/");
const slugOf = (path: string) => path.split("/").at(-1) ?? path;

const tags = s
  .array(
    s
      .string()
      .regex(
        TAG_PATTERN,
        "tags must be lowercase kebab-case, e.g. react-native",
      ),
  )
  .min(1, "at least one tag is required")
  .max(5, "at most five tags are allowed");

const featured = s.number().int().min(1).max(12).optional();

function checkDates(
  data: { date: string; updated?: string | undefined },
  ctx: {
    addIssue: (issue: {
      code: "custom";
      message: string;
      path: string[];
    }) => void;
  },
) {
  if (data.updated !== undefined && data.updated < data.date) {
    ctx.addIssue({
      code: "custom",
      message: "updated must be on or after date",
      path: ["updated"],
    });
  }
}

function warnLongTitle(title: string, meta: ZodMeta) {
  if (title.length > 60) {
    logger.warn(
      `${sourceOf(meta)}: title is ${title.length} chars; Google may truncate past ~60`,
    );
  }
}

const entries = defineCollection({
  name: "Entry",
  pattern: ["entries/*.mdx", "entries/*/index.mdx"],
  schema: s
    .object({
      title: s.string().min(10).max(70),
      summary: s.string().min(50).max(160),
      date: s.isodate(),
      updated: s.isodate().optional(),
      type: s.enum(ENTRY_TYPES, {
        errorMap: () => ({
          message: `entries use type ${ENTRY_TYPES.join(" | ")}; videos, podcasts, talks and guest posts belong in content/links`,
        }),
      }),
      tags,
      featured,
      externalUrl: s.unknown().optional(),
      lang: s.enum(LANGS).default("en"),
      translationOf: s.string().optional(),
      cover: s.image().optional(),
      coverAlt: s.string().trim().min(1).optional(),
      canonical: s.string().url().optional(),
      noindex: s.boolean().default(false),
      draft: s.boolean().default(false),
      redirectFrom: s.array(s.string()).default([]),
      path: s.path(),
      metadata: s.metadata(),
      toc: s.toc(),
      raw: s.raw(),
      body: s.mdx(),
    })
    .superRefine((data, ctx) => {
      checkDates(data, ctx);
      if (data.externalUrl !== undefined) {
        ctx.addIssue({
          code: "custom",
          message:
            "externalUrl is not allowed on entries; move this file to content/links",
          path: ["externalUrl"],
        });
      }
      if (data.cover !== undefined && data.coverAlt === undefined) {
        ctx.addIssue({
          code: "custom",
          message: "coverAlt is required when cover is set",
          path: ["coverAlt"],
        });
      }
    })
    .transform(
      (
        { path, externalUrl: _externalUrl, metadata, raw, ...data },
        { meta },
      ) => {
        warnLongTitle(data.title, meta);
        const slug = slugOf(path);
        return {
          ...data,
          kind: "entry" as const,
          slug,
          url: `/${slug}`,
          source: sourceOf(meta),
          raw: stripMdxComments(raw),
          readingTime: metadata.readingTime,
          wordCount: metadata.wordCount,
          plainText: stripMdxComments(meta.plain ?? ""),
        };
      },
    ),
});

const links = defineCollection({
  name: "Link",
  pattern: "links/*.mdx",
  schema: s
    .object({
      title: s.string().min(10).max(70),
      summary: s.string().min(50).max(160),
      date: s.isodate(),
      updated: s.isodate().optional(),
      type: s.enum(LINK_TYPES, {
        errorMap: () => ({
          message: `links use type ${LINK_TYPES.join(" | ")}; essays, notes, tutorials and snippets belong in content/entries`,
        }),
      }),
      tags,
      featured,
      externalUrl: s.string().url(),
      lang: s.enum(LANGS).default("en"),
      draft: s.boolean().default(false),
      path: s.path(),
    })
    .superRefine(checkDates)
    .transform(({ path, ...data }, { meta }) => {
      warnLongTitle(data.title, meta);
      return {
        ...data,
        kind: "link" as const,
        slug: slugOf(path),
        url: data.externalUrl,
        source: sourceOf(meta),
        plainText: stripMdxComments(meta.plain ?? ""),
      };
    }),
});

const projects = defineCollection({
  name: "Project",
  pattern: "projects/*.yml",
  schema: s
    .object({
      name: s.string().min(1),
      summary: s.string().min(1).max(140),
      status: s.enum(PROJECT_STATUSES),
      url: s.string().url().optional(),
      playStoreUrl: s.string().url().optional(),
      repoUrl: s.string().url().optional(),
      featured: s.boolean().default(false),
      order: s.number().int(),
      draft: s.boolean().default(false),
      path: s.path(),
    })
    .transform(({ path, ...data }) => ({ ...data, slug: slugOf(path) })),
});

const pages = defineCollection({
  name: "Page",
  pattern: "pages/*.mdx",
  schema: s
    .object({
      title: s.string().min(1).max(70),
      summary: s.string().min(50).max(160),
      updated: s.isodate().optional(),
      draft: s.boolean().default(false),
      path: s.path(),
      toc: s.toc(),
      body: s.mdx(),
    })
    .transform(({ path, ...data }) => ({ ...data, slug: slugOf(path) })),
});

export default defineConfig({
  // CONTENT_DIR lets the e2e suite build against fixture content in production mode.
  root: process.env.CONTENT_DIR ?? "content",
  strict: true,
  output: { ...output, clean: false },
  collections: { entries, links, projects, pages },
  mdx: {
    copyLinkedFiles: false,
    remarkPlugins: [[remarkContent, { name: output.name, base: output.base }]],
    rehypePlugins: [
      [rehypePrettyCode, prettyCode],
      rehypeSlug,
      [
        rehypeAutolinkHeadings,
        { behavior: "wrap", properties: { className: ["heading-anchor"] } },
      ],
    ],
  },
  prepare: ({ entries, links }) => {
    const issues = findCollectionIssues(entries, links);
    if (issues.length > 0) {
      throw new Error(
        `Content validation failed:\n  - ${issues.join("\n  - ")}`,
      );
    }
  },
  complete: ({ entries, links }) => {
    const missing = missingSiteConfigFields();
    if (missing.length > 0) {
      logger.warn(`src/site.config.ts: not set yet → ${missing.join(", ")}`);
    }
    // In `next dev` the watcher re-runs this on every content change; production
    // builds run scripts/build-search-index.ts as an explicit step instead.
    if (process.env.NODE_ENV === "development") {
      const { json } = buildSearchIndex(
        { entries, links },
        {
          mode: visibilityModeFor(process.env),
          now: new Date(),
          timeZone: siteConfig.timeZone,
        },
      );
      writeFileSync("public/search-index.json", json);
    }
  },
});
