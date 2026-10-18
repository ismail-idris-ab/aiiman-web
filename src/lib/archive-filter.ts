/** Archive filter state ⇄ URL search params, and item matching. Pure; used by the client island. */

import { ITEM_TYPES, LANGS, type ItemType, type Lang } from "./content/model";

export interface ArchiveFilters {
  type: ItemType | undefined;
  tag: string | undefined;
  lang: Lang | undefined;
  q: string;
}

/** The fields the island needs per Item. Kept small: it ships in the page payload. */
export interface ArchiveItemMeta {
  id: string;
  type: ItemType;
  tags: readonly string[];
  lang: Lang;
  /** Lowercased title + summary + tags, for the text filter. */
  text: string;
}

export const EMPTY_FILTERS: ArchiveFilters = {
  type: undefined,
  tag: undefined,
  lang: undefined,
  q: "",
};

const isItemType = (value: string | null): value is ItemType =>
  value !== null && (ITEM_TYPES as readonly string[]).includes(value);
const isLang = (value: string | null): value is Lang =>
  value !== null && (LANGS as readonly string[]).includes(value);

/** Unknown values are ignored rather than producing an empty archive. */
export function parseFilters(
  params: Pick<URLSearchParams, "get">,
): ArchiveFilters {
  const type = params.get("type");
  const lang = params.get("lang");
  const tag = params.get("tag")?.trim().toLowerCase();
  return {
    type: isItemType(type) ? type : undefined,
    tag: tag === undefined || tag === "" ? undefined : tag,
    lang: isLang(lang) ? lang : undefined,
    q: (params.get("q") ?? "").trim().slice(0, 100),
  };
}

/** Canonical query string: fixed key order, empty values dropped. */
export function toQueryString(filters: ArchiveFilters): string {
  const params = new URLSearchParams();
  if (filters.type !== undefined) params.set("type", filters.type);
  if (filters.tag !== undefined) params.set("tag", filters.tag);
  if (filters.lang !== undefined) params.set("lang", filters.lang);
  if (filters.q !== "") params.set("q", filters.q);
  const query = params.toString();
  return query === "" ? "" : `?${query}`;
}

export const isFiltered = (filters: ArchiveFilters): boolean =>
  toQueryString(filters) !== "";

export function matchesFilters(
  item: ArchiveItemMeta,
  filters: ArchiveFilters,
): boolean {
  if (filters.type !== undefined && item.type !== filters.type) return false;
  if (filters.tag !== undefined && !item.tags.includes(filters.tag))
    return false;
  if (filters.lang !== undefined && item.lang !== filters.lang) return false;
  if (filters.q !== "") {
    const words = filters.q.toLowerCase().split(/\s+/);
    if (!words.every((word) => item.text.includes(word))) return false;
  }
  return true;
}
