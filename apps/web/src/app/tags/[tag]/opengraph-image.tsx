import { notFound } from "next/navigation";

import { getTagCount, getTags } from "@/lib/content";
import { OG_CONTENT_TYPE, OG_SIZE, renderOgCard } from "@/lib/seo/og-card";
import { siteConfig } from "@/site.config";

/* Single-image route so generateStaticParams here prerenders every card (see [slug]/opengraph-image). */
export const dynamicParams = false;

export function generateStaticParams() {
  return getTags().map(({ tag }) => ({ tag }));
}

export const alt = `Title card for a tag page on ${siteConfig.name}, showing the tag and post count`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({
  params,
}: {
  params: Promise<{ tag: string }>;
}) {
  const { tag } = await params;
  const count = getTagCount(tag);
  if (count === 0) notFound();
  return renderOgCard({
    title: `#${tag}`,
    badge: "Tag",
    meta: `${count} ${count === 1 ? "post" : "posts"}`,
  });
}
