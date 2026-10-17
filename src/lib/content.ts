import "server-only";

import { entries, links, pages, projects } from "#velite";

import { serverEnv } from "@/env.server";
import { createContentQueries } from "@/lib/content/queries";
import { visibilityModeFor } from "@/lib/content/visibility";
import { siteConfig } from "@/site.config";

export type { Item, TagCount } from "@/lib/content/queries";

/**
 * All content reads go through here. Evaluated once per build (or dev server
 * start), which is when Scheduled Items are decided — see the daily rebuild.
 */
export const content = createContentQueries(
  { entries, links, projects, pages },
  {
    mode: visibilityModeFor(serverEnv),
    now: new Date(),
    timeZone: siteConfig.timeZone,
  },
);

export const {
  getEntries,
  getLinks,
  getItems,
  getLatest,
  getEntry,
  filterItems,
  getFeatured,
  getByTag,
  getTags,
  getTagCount,
  getTranslation,
  getRelated,
  getAdjacent,
  getProjects,
  getFeaturedProjects,
  getPage,
  previewReason,
} = content;
