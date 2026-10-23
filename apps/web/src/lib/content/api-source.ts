/**
 * Posts published in the admin, shaped as Entries so the existing queries,
 * SEO builders and pages serve them unchanged. Pure: fetch is injected.
 */

import {
  docToText,
  publicPostListSchema,
  type Doc,
  type PublicPost,
} from "@aiiman/shared";

import type { Entry as VeliteEntry } from "#velite";

import { calendarDate } from "./visibility";

/** An MDX Entry, or one from the admin whose body is a Tiptap doc (`doc`) instead of compiled MDX. */
export type Entry = VeliteEntry & { doc?: Doc };

export interface ApiSourceEnv {
  VERCEL_ENV?: string | undefined;
  CONTENT_API_URL?: string | undefined;
}

/** The API to read posts from, or undefined for MDX only. Production stays on MDX until switch-over (#24). */
export function contentApiUrlFor(env: ApiSourceEnv): string | undefined {
  if (env.VERCEL_ENV === "production") return undefined;
  return env.CONTENT_API_URL;
}

// Velite's default, so reading times match MDX Entries.
const WORDS_PER_MINUTE = 265;

/** Calendar date in the site's time zone, stored like Velite's frontmatter dates (UTC midnight). */
const calendarIso = (iso: string, timeZone: string) =>
  `${calendarDate(new Date(iso), timeZone)}T00:00:00.000Z`;

export function postToEntry(
  post: PublicPost,
  timeZone: string,
): Entry & { doc: Doc } {
  const text = docToText(post.body);
  const wordCount = text.split(/\s+/).filter((word) => word !== "").length;
  const date = calendarIso(post.publishedAt, timeZone);
  const updated = calendarIso(post.updatedAt, timeZone);
  return {
    title: post.title,
    summary: post.summary,
    date,
    updated: updated > date ? updated : undefined,
    type: "essay",
    tags: [],
    lang: "en",
    noindex: false,
    draft: false,
    redirectFrom: [],
    toc: [],
    body: "",
    doc: post.body,
    kind: "entry",
    slug: post.slug,
    url: `/${post.slug}`,
    source: `admin:${post.slug}`,
    raw: text,
    readingTime: Math.max(1, Math.round(wordCount / WORDS_PER_MINUTE)),
    wordCount,
    plainText: text,
  };
}

/** Admin posts win over MDX Entries with the same slug: imported posts replace their files. */
export function mergeEntries(
  mdx: readonly Entry[],
  admin: readonly Entry[],
): Entry[] {
  const adminSlugs = new Set(admin.map((entry) => entry.slug));
  return [...mdx.filter((entry) => !adminSlugs.has(entry.slug)), ...admin];
}

export async function fetchPublishedPosts(
  baseUrl: string,
  fetcher: (url: URL) => Promise<Response>,
): Promise<PublicPost[]> {
  const res = await fetcher(new URL("/api/public/posts", baseUrl));
  if (!res.ok) throw new Error(`Content API answered ${res.status}`);
  // The API is a trust boundary too: bodies go through the same allowlist the admin saves with.
  return publicPostListSchema.parse(await res.json()).posts;
}
