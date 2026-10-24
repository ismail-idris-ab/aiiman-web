/**
 * Content queries over Velite output. Pure: data, visibility mode and clock are
 * injected, so the same logic serves the app, build scripts and unit tests.
 */

import type { Entry, Link, Page, Project } from "#velite";

import type { ItemType, Lang } from "./model";
import { isScheduled, isVisible, type VisibilityMode } from "./visibility";

export type Item = Entry | Link;

export interface ContentSource {
  entries: readonly Entry[];
  links: readonly Link[];
  projects: readonly Project[];
  pages: readonly Page[];
}

export interface QueryOptions {
  mode: VisibilityMode;
  now: Date;
  timeZone: string;
}

export interface TagCount {
  tag: string;
  count: number;
}

export interface ItemFilter {
  type?: ItemType | undefined;
  tag?: string | undefined;
  lang?: Lang | undefined;
}

const newestFirst = (a: Item, b: Item) =>
  b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug);

export function createContentQueries(
  source: ContentSource,
  options: QueryOptions,
) {
  const { mode, now, timeZone } = options;
  const visible = <T extends { draft: boolean; date: string }>(item: T) =>
    isVisible(item, mode, now, timeZone);

  const entries = source.entries.filter(visible).sort(newestFirst);
  const links = source.links.filter(visible).sort(newestFirst);
  const items: Item[] = [...entries, ...links].sort(newestFirst);
  const entryBySlug = new Map(entries.map((entry) => [entry.slug, entry]));

  const projects = source.projects
    .filter((project) => mode === "authoring" || !project.draft)
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  const pages = new Map(
    source.pages
      .filter((page) => mode === "authoring" || !page.draft)
      .map((page) => [page.slug, page]),
  );

  const tagCounts = new Map<string, number>();
  for (const item of items) {
    for (const tag of item.tags)
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
  }
  const tags: TagCount[] = [...tagCounts]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));

  /** The other-language version of an Entry, if both are visible. */
  function getTranslation(entry: Entry): Entry | undefined {
    if (entry.translationOf !== undefined)
      return entryBySlug.get(entry.translationOf);
    return entries.find((other) => other.translationOf === entry.slug);
  }

  return {
    mode,

    getEntries: (): readonly Entry[] => entries,
    getLinks: (): readonly Link[] => links,
    /** Every visible Item, newest first. */
    getItems: (): readonly Item[] => items,
    getLatest: (limit: number): readonly Item[] => items.slice(0, limit),
    getEntry: (slug: string): Entry | undefined => entryBySlug.get(slug),

    filterItems: (filter: ItemFilter): readonly Item[] =>
      items.filter(
        (item) =>
          (filter.type === undefined || item.type === filter.type) &&
          (filter.tag === undefined || item.tags.includes(filter.tag)) &&
          (filter.lang === undefined || item.lang === filter.lang),
      ),

    /** Featured Items in their "Start here" order. */
    getFeatured: (): readonly Item[] =>
      items
        .filter((item) => item.featured !== undefined)
        .sort((a, b) => (a.featured ?? 0) - (b.featured ?? 0)),

    getByTag: (tag: string): readonly Item[] =>
      items.filter((item) => item.tags.includes(tag)),
    getTags: (): readonly TagCount[] => tags,
    getTagCount: (tag: string): number => tagCounts.get(tag) ?? 0,

    getTranslation,

    /** Entries sharing the most tags, then the newest. Excludes the Entry and its translation. */
    getRelated(entry: Entry, limit = 3): readonly Entry[] {
      const exclude = new Set([entry.slug, getTranslation(entry)?.slug]);
      const ownTags = new Set(entry.tags);
      return entries
        .filter((candidate) => !exclude.has(candidate.slug))
        .map((candidate) => ({
          candidate,
          score: candidate.tags.filter((tag) => ownTags.has(tag)).length,
        }))
        .sort(
          (a, b) => b.score - a.score || newestFirst(a.candidate, b.candidate),
        )
        .slice(0, limit)
        .map(({ candidate }) => candidate);
    },

    /** Neighbouring Entries by date: `older` is published before, `newer` after. */
    getAdjacent(entry: Entry): {
      older: Entry | undefined;
      newer: Entry | undefined;
    } {
      const index = entries.findIndex(
        (candidate) => candidate.slug === entry.slug,
      );
      if (index === -1) return { older: undefined, newer: undefined };
      return { older: entries[index + 1], newer: entries[index - 1] };
    },

    getProjects: (): readonly Project[] => projects,
    getFeaturedProjects: (): readonly Project[] =>
      projects.filter((project) => project.featured),
    getPage: (slug: string): Page | undefined => pages.get(slug),

    /** Why an Item is shown only while authoring, for the preview banner. */
    previewReason(item: {
      draft: boolean;
      date: string;
    }): "draft" | "scheduled" | undefined {
      if (item.draft) return "draft";
      if (isScheduled(item.date, now, timeZone)) return "scheduled";
      return undefined;
    },
  };
}

export type ContentQueries = ReturnType<typeof createContentQueries>;
