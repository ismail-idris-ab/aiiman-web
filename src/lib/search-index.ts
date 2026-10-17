/** Builds the serialized MiniSearch index. Pure; callers decide where to write it. */

import type { Entry, Link } from "#velite";
import MiniSearch from "minisearch";

import { createContentQueries } from "./content/queries";
import type { VisibilityMode } from "./content/visibility";
import { searchIndexOptions, type SearchDocument } from "./search";

export function buildSearchIndex(
  source: { entries: readonly Entry[]; links: readonly Link[] },
  options: { mode: VisibilityMode; now: Date; timeZone: string },
): { json: string; count: number } {
  const content = createContentQueries(
    { ...source, projects: [], pages: [] },
    options,
  );

  const documents: SearchDocument[] = content.getItems().map((item) => ({
    id: `${item.kind}:${item.slug}`,
    title: item.title,
    summary: item.summary,
    tags: item.tags,
    plainText: item.plainText,
    url: item.url,
    type: item.type,
    lang: item.lang,
    date: item.date,
    external: item.kind === "link",
  }));

  const index = new MiniSearch<SearchDocument>(searchIndexOptions);
  index.addAll(documents);
  return { json: JSON.stringify(index), count: documents.length };
}
