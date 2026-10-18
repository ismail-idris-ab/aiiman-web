import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { ItemList } from "@/components/ui/item-list";
import { getByTag, getTagCount, getTags } from "@/lib/content";
import { MIN_ITEMS_FOR_INDEXED_TAG } from "@/lib/content/model";

export const dynamicParams = false;

export function generateStaticParams() {
  return getTags().map(({ tag }) => ({ tag }));
}

export async function generateMetadata({
  params,
}: PageProps<"/tags/[tag]">): Promise<Metadata> {
  const { tag } = await params;
  const count = getTagCount(tag);
  if (count === 0) return {};
  return {
    title: `#${tag}`,
    description: `${count} ${count === 1 ? "post" : "posts"} tagged ${tag}: essays, notes, tutorials and talks.`,
    // Thin tag pages stay out of the index but still pass link equity.
    ...(count < MIN_ITEMS_FOR_INDEXED_TAG
      ? { robots: { index: false, follow: true } }
      : {}),
  };
}

export default async function TagPage({ params }: PageProps<"/tags/[tag]">) {
  const { tag } = await params;
  const items = getByTag(tag);
  if (items.length === 0) notFound();

  return (
    <div className="max-w-[68ch]">
      <Breadcrumbs
        trail={[
          { name: "Home", href: "/" },
          { name: "Writing", href: "/writing" },
          { name: `#${tag}`, href: `/tags/${tag}` },
        ]}
      />
      <h1 className="mt-4 font-serif text-4xl font-bold tracking-tight">
        #{tag}
      </h1>
      <p className="mt-3 text-muted">
        {items.length} {items.length === 1 ? "post" : "posts"} tagged {tag}
      </p>
      <div className="mt-8">
        <ItemList items={items} showSummary />
      </div>
    </div>
  );
}
