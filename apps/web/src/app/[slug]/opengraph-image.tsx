import { notFound } from "next/navigation";

import { getEntries, getEntry } from "@/lib/content";
import { entryOgCard } from "@/lib/seo/entry-og";
import { OG_CONTENT_TYPE, OG_SIZE, renderOgCard } from "@/lib/seo/og-card";
import { siteConfig } from "@/site.config";

/*
 * Single-image route (no generateImageMetadata) so this file's own
 * generateStaticParams is used and every card is prerendered at build.
 * The trade-off is one alt text for all cards; og:title carries the title.
 */
// Posts published in the admin after the build render on first request, then stay cached
// until /api/revalidate expires them. Unknown slugs still 404.
export const dynamicParams = true;

export async function generateStaticParams() {
  return (await getEntries()).map((entry) => ({ slug: entry.slug }));
}

export const alt = `Title card for a post on ${siteConfig.name}, showing its title, type and date`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const entry = await getEntry((await params).slug);
  if (entry === undefined) notFound();
  return renderOgCard(entryOgCard(entry));
}
