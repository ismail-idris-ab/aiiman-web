/**
 * Posts published in the admin, shaped as Entries so the existing queries,
 * SEO builders and pages serve them unchanged. Pure: fetch is injected.
 */

import {
  docToc,
  docToMarkdown,
  docToText,
  previewPostSchema,
  readingMinutes,
  wordCount,
  publicPostListSchema,
  type Doc,
  type PreviewPost,
  type PublicPost,
} from "@aiiman/shared";
import { z } from "zod";

import type { Entry as VeliteEntry } from "#velite";

const previewPostResponseSchema = z.object({ post: previewPostSchema });

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

/** Calendar dates are stored like Velite's frontmatter dates: UTC midnight. */
const calendarIso = (day: string) => `${day}T00:00:00.000Z`;

export function postToEntry(
  post: PublicPost,
  { draft = false }: { draft?: boolean } = {},
): Entry & { doc: Doc } {
  return {
    title: post.title,
    summary: post.summary,
    date: calendarIso(post.date),
    updated: post.updated === undefined ? undefined : calendarIso(post.updated),
    type: post.type,
    tags: post.tags,
    lang: post.lang,
    featured: post.featured,
    canonical: post.canonical,
    noindex: post.noindex,
    draft,
    redirectFrom: [],
    toc: docToc(post.body),
    body: "",
    doc: post.body,
    kind: "entry",
    slug: post.slug,
    url: `/${post.slug}`,
    source: `admin:${post.slug}`,
    // Markdown for the .md route and llms.txt; plain text for search.
    raw: docToMarkdown(post.body),
    readingTime: readingMinutes(post.body),
    wordCount: wordCount(post.body),
    plainText: docToText(post.body),
  };
}

/**
 * Admin posts win over MDX Items: an MDX Entry with the same slug is dropped
 * (imported posts replace their files) and MDX Items lose a featured position
 * an admin post holds. The API keeps slugs and positions unique among posts.
 */
export function mergeAdminPosts<L extends { featured?: number | undefined }>(
  mdx: { entries: readonly Entry[]; links: readonly L[] },
  admin: readonly Entry[],
): { entries: Entry[]; links: L[] } {
  const slugs = new Set(admin.map((entry) => entry.slug));
  const positions = new Set(admin.map((entry) => entry.featured));
  const free = <T extends { featured?: number | undefined }>(item: T): T =>
    item.featured !== undefined && positions.has(item.featured)
      ? { ...item, featured: undefined }
      : item;
  return {
    entries: [
      ...mdx.entries.filter((entry) => !slugs.has(entry.slug)).map(free),
      ...admin,
    ],
    links: mdx.links.map(free),
  };
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

/** Any post by id for a draft preview, or null when it doesn't exist. Never cached. */
export async function fetchPreviewPost(
  baseUrl: string,
  postId: string,
  secret: string,
  fetcher: (url: URL, init: RequestInit) => Promise<Response>,
): Promise<PreviewPost | null> {
  const res = await fetcher(
    new URL(`/api/preview/posts/${encodeURIComponent(postId)}`, baseUrl),
    { headers: { authorization: `Bearer ${secret}` }, cache: "no-store" },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Content API answered ${res.status}`);
  return previewPostResponseSchema.parse(await res.json()).post;
}
