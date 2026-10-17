/**
 * MiniSearch options shared by the index build script and the search dialog.
 * MiniSearch does not serialize these, so both sides must use the same object.
 */

import type { Options, SearchOptions } from "minisearch";

import type { ItemType, Lang } from "./content/model";

/** Fields kept in the index for rendering results. Nothing else is shipped. */
export interface SearchDocument {
  id: string;
  title: string;
  summary: string;
  tags: string[];
  plainText: string;
  url: string;
  type: ItemType;
  lang: Lang;
  date: string;
  external: boolean;
}

export type SearchResultFields = Omit<SearchDocument, "tags" | "plainText">;

export const SEARCH_INDEX_PATH = "/search-index.json";

export const searchIndexOptions: Options<SearchDocument> = {
  fields: ["title", "tags", "summary", "plainText"],
  storeFields: ["title", "summary", "url", "type", "lang", "date", "external"],
  // Applies to indexed fields only; stored fields keep their original types.
  stringifyField: (value: unknown) =>
    Array.isArray(value) ? value.join(" ") : String(value ?? ""),
};

export const searchQueryOptions: SearchOptions = {
  boost: { title: 3, tags: 2, summary: 1.5, plainText: 1 },
  prefix: true,
  fuzzy: 0.2,
  combineWith: "AND",
};
