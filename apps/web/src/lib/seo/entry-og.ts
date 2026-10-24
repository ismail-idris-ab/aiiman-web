import "server-only";

import type { Entry } from "#velite";

import { LANG_LABELS, TYPE_LABELS } from "@/lib/content/model";
import { formatDate } from "@/lib/format";

import type { OgCard } from "./og-card";

/** The share card for an Entry; shared by its opengraph-image route and the draft preview. */
export function entryOgCard(entry: Entry): OgCard {
  const date = formatDate(entry.date);
  return {
    title: entry.title,
    badge: TYPE_LABELS[entry.type],
    meta: entry.lang === "en" ? date : `${date}, ${LANG_LABELS[entry.lang]}`,
  };
}
