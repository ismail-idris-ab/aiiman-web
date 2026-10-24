import { notFound } from "next/navigation";

import { getEntries, getEntry } from "@/lib/content";
import { LANG_LABELS, TYPE_LABELS } from "@/lib/content/model";
import { formatDate } from "@/lib/format";
import { OG_CONTENT_TYPE, OG_SIZE, renderOgCard } from "@/lib/seo/og-card";
import { siteConfig } from "@/site.config";

/*
 * Single-image route (no generateImageMetadata) so this file's own
 * generateStaticParams is used and every card is prerendered at build.
 * The trade-off is one alt text for all cards; og:title carries the title.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return getEntries().map((entry) => ({ slug: entry.slug }));
}

export const alt = `Title card for a post on ${siteConfig.name}, showing its title, type and date`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const entry = getEntry((await params).slug);
  if (entry === undefined) notFound();
  const date = formatDate(entry.date);
  return renderOgCard({
    title: entry.title,
    badge: TYPE_LABELS[entry.type],
    meta: entry.lang === "en" ? date : `${date}, ${LANG_LABELS[entry.lang]}`,
  });
}
