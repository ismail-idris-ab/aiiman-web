import "server-only";

import { cache } from "react";

import { entries, links, pages, projects } from "#velite";

import { serverEnv } from "@/env.server";
import {
  contentApiUrlFor,
  fetchPublishedPosts,
  mergeAdminPosts,
  postToEntry,
} from "@/lib/content/api-source";
import {
  createContentQueries,
  type ContentQueries,
} from "@/lib/content/queries";
import { visibilityModeFor } from "@/lib/content/visibility";
import { siteConfig } from "@/site.config";

export type { Entry } from "@/lib/content/api-source";
export type { Item, TagCount } from "@/lib/content/queries";

/** Tag on every content fetch; POST /api/revalidate expires it. */
export const CONTENT_TAG = "content";

export const contentMode = visibilityModeFor(serverEnv);
const timeZone = siteConfig.timeZone;
const apiUrl = contentApiUrlFor(serverEnv);

/** The admin API, where this deploy reads it (previews only until switch-over). */
export const adminApiUrl = apiUrl;

/** True when published admin posts are merged in (previews only until switch-over). */
export const readsAdminPosts = apiUrl !== undefined;

/**
 * MDX only: evaluated once per build (or dev server start), which is when
 * Scheduled Items are decided — see the daily rebuild.
 */
const mdxContent = createContentQueries(
  { entries, links, projects, pages },
  { mode: contentMode, now: new Date(), timeZone },
);

/**
 * Keys the data cache per deployment: Next's fetch cache outlives a build, so
 * without it a new deploy could start from an older deploy's API response.
 */
const cacheKeyHeaders = {
  "x-site-deployment": serverEnv.VERCEL_DEPLOYMENT_ID ?? "local",
};

/** Once per request; the fetch sits in Next's data cache until revalidated. */
const withAdminPosts = (baseUrl: string) =>
  cache(async (): Promise<ContentQueries> => {
    const posts = await fetchPublishedPosts(baseUrl, (url) =>
      fetch(url, {
        cache: "force-cache",
        headers: cacheKeyHeaders,
        next: { tags: [CONTENT_TAG] },
      }),
    );
    return createContentQueries(
      {
        ...mergeAdminPosts(
          { entries, links },
          posts.map((post) => postToEntry(post)),
        ),
        projects,
        pages,
      },
      { mode: contentMode, now: new Date(), timeZone },
    );
  });

/** All content reads go through here. */
export const getContent: () => Promise<ContentQueries> =
  apiUrl === undefined ? async () => mdxContent : withAdminPosts(apiUrl);

type Async<F> = F extends (...args: infer A) => infer R
  ? (...args: A) => Promise<R>
  : never;

/** A query bound to the current content source. */
function query<K extends Exclude<keyof ContentQueries, "mode">>(
  key: K,
): Async<ContentQueries[K]> {
  const bound = async (...args: unknown[]) => {
    const fn = (await getContent())[key] as (...a: unknown[]) => unknown;
    return fn(...args);
  };
  return bound as Async<ContentQueries[K]>;
}

export const getEntries = query("getEntries");
export const getLinks = query("getLinks");
export const getItems = query("getItems");
export const getLatest = query("getLatest");
export const getEntry = query("getEntry");
export const filterItems = query("filterItems");
export const getFeatured = query("getFeatured");
export const getByTag = query("getByTag");
export const getTags = query("getTags");
export const getTagCount = query("getTagCount");
export const getTranslation = query("getTranslation");
export const getRelated = query("getRelated");
export const getAdjacent = query("getAdjacent");
export const getProjects = query("getProjects");
export const getFeaturedProjects = query("getFeaturedProjects");
export const getPage = query("getPage");
export const previewReason = query("previewReason");
