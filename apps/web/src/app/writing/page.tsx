import type { Metadata } from "next";
import Link from "next/link";

import { ArchiveFilterBar } from "@/components/archive/archive-filters";
import { ItemRow } from "@/components/ui/item-list";
import type { ArchiveItemMeta } from "@/lib/archive-filter";
import { getItems, getTags, type Item } from "@/lib/content";
import { ITEM_TYPES, LANGS } from "@/lib/content/model";
import { yearOf } from "@/lib/format";
import { pageMetadata } from "@/lib/seo/metadata";
import { siteConfig } from "@/site.config";

export const metadata: Metadata = pageMetadata({
  title: "Writing",
  description: `Every essay, note, tutorial, video and talk by ${siteConfig.author.name}, newest first. Filter by type, tag or language.`,
  // Always the bare path: filter query strings never become canonical URLs.
  path: "/writing",
});

const LIST_ID = "archive-list";
const itemId = (item: Item) => `${item.kind}:${item.slug}`;

export default async function WritingPage() {
  const items = await getItems();
  const tags = await getTags();

  const years = new Map<string, Item[]>();
  for (const item of items) {
    const year = yearOf(item.date);
    years.set(year, [...(years.get(year) ?? []), item]);
  }

  const meta: ArchiveItemMeta[] = items.map((item) => ({
    id: itemId(item),
    type: item.type,
    tags: item.tags,
    lang: item.lang,
    text: `${item.title} ${item.summary} ${item.tags.join(" ")}`.toLowerCase(),
  }));
  const typesPresent = ITEM_TYPES.filter((type) =>
    items.some((item) => item.type === type),
  );
  const langsPresent = LANGS.filter((lang) =>
    items.some((item) => item.lang === lang),
  );

  return (
    <div className="max-w-measure">
      <h1 className="font-serif text-4xl font-bold tracking-tight">Writing</h1>
      <p className="mt-3 font-serif text-xl leading-relaxed text-muted">
        Everything in one place: essays, notes, tutorials, and links to videos
        and talks.
      </p>

      {items.length === 0 ? (
        <p className="mt-10 text-muted">The first posts are on their way.</p>
      ) : (
        <>
          <div className="mt-8">
            <ArchiveFilterBar
              items={meta}
              types={typesPresent}
              tags={tags.map(({ tag }) => tag)}
              langs={langsPresent}
              listId={LIST_ID}
            />
          </div>

          <div id={LIST_ID} className="mt-8">
            {[...years].map(([year, group]) => (
              <section
                key={year}
                data-year={year}
                aria-labelledby={`year-${year}`}
                className="mt-8 first:mt-0"
              >
                <h2
                  id={`year-${year}`}
                  className="border-b border-border pb-1 font-serif text-2xl font-bold"
                >
                  {year}
                </h2>
                <ul className="divide-y divide-border">
                  {group.map((item) => (
                    <ItemRow
                      key={itemId(item)}
                      item={item}
                      dataItemId={itemId(item)}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>

          <section aria-labelledby="tags" className="mt-16">
            <h2 id="tags" className="font-serif text-2xl font-bold">
              Tags
            </h2>
            <ul className="mt-3 flex flex-wrap gap-2 text-sm">
              {tags.map(({ tag, count }) => (
                <li key={tag}>
                  <Link
                    href={`/tags/${tag}`}
                    className="inline-block rounded-md bg-accent-soft px-2 py-1 text-foreground hover:underline"
                  >
                    #{tag} <span className="text-muted">({count})</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
