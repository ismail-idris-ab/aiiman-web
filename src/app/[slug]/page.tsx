import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { JsonLd } from "@/components/layout/json-ld";
import { MdxContent } from "@/components/mdx/mdx-content";
import { NewsletterBox } from "@/components/newsletter/newsletter-box";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { ItemList } from "@/components/ui/item-list";
import {
  TableOfContents,
  countHeadings,
} from "@/components/ui/table-of-contents";
import { TypeBadge } from "@/components/ui/type-badge";
import { siteUrl } from "@/env";
import {
  getAdjacent,
  getEntries,
  getEntry,
  getRelated,
  getTranslation,
  previewReason,
} from "@/lib/content";
import { LANG_LABELS } from "@/lib/content/model";
import { formatDate, formatReadingTime, isoDay } from "@/lib/format";
import { entryJsonLd } from "@/lib/seo/jsonld";
import { entryMetadata } from "@/lib/seo/metadata";
import { absoluteUrl, entryOgImagePath } from "@/lib/seo/urls";
import { siteConfig } from "@/site.config";

export const dynamicParams = false;

export function generateStaticParams() {
  return getEntries().map((entry) => ({ slug: entry.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/[slug]">): Promise<Metadata> {
  const entry = getEntry((await params).slug);
  if (entry === undefined) return {};
  return entryMetadata(siteUrl, entry, getTranslation(entry));
}

const TOC_MIN_HEADINGS = 3;

export default async function EntryPage({ params }: PageProps<"/[slug]">) {
  const entry = getEntry((await params).slug);
  if (entry === undefined) notFound();

  const translation = getTranslation(entry);
  const related = getRelated(entry);
  const { older, newer } = getAdjacent(entry);
  const showToc = countHeadings(entry.toc) >= TOC_MIN_HEADINGS;
  const reason = previewReason(entry);
  const lang = entry.lang === "en" ? undefined : entry.lang;

  return (
    <div
      className={
        showToc ? "lg:grid lg:grid-cols-[minmax(0,45rem)_14rem] lg:gap-16" : ""
      }
    >
      <article lang={lang} className="min-w-0">
        <JsonLd
          data={entryJsonLd(
            siteUrl,
            entry,
            absoluteUrl(siteUrl, entryOgImagePath(entry)),
          )}
        />
        <header>
          <Breadcrumbs
            trail={[
              { name: "Home", href: "/" },
              { name: "Writing", href: "/writing" },
              { name: entry.title, href: entry.url },
            ]}
          />
          {reason === undefined ? null : (
            <p className="mt-4 inline-block rounded-md border border-accent px-2 py-0.5 text-sm text-accent">
              {reason === "draft"
                ? "Draft, not published"
                : `Scheduled for ${formatDate(entry.date)}`}
            </p>
          )}
          <h1 className="mt-4 font-serif text-3xl leading-tight font-bold tracking-tight text-balance sm:text-4xl">
            {entry.title}
          </h1>
          <p className="mt-3 font-serif text-xl leading-relaxed text-pretty text-muted">
            {entry.summary}
          </p>
          <div
            className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted"
            lang="en"
          >
            <span>
              By{" "}
              <Link
                href="/about"
                rel="author"
                className="text-foreground underline underline-offset-4"
              >
                {siteConfig.author.name}
              </Link>
            </span>
            <span>
              Published{" "}
              <time dateTime={isoDay(entry.date)}>
                {formatDate(entry.date)}
              </time>
            </span>
            {entry.updated === undefined ? null : (
              <span>
                Updated{" "}
                <time dateTime={isoDay(entry.updated)}>
                  {formatDate(entry.updated)}
                </time>
              </span>
            )}
            <span>{formatReadingTime(entry.readingTime)}</span>
            <TypeBadge type={entry.type} />
            {entry.lang === "en" ? null : (
              <span className="rounded border border-muted/50 px-1.5">
                {LANG_LABELS[entry.lang]}
              </span>
            )}
          </div>
          {translation === undefined ? null : (
            <p className="mt-3 text-sm" lang="en">
              <Link
                href={translation.url}
                hrefLang={translation.lang}
                className="text-accent underline underline-offset-4"
              >
                {translation.lang === "ha"
                  ? "Read this in Hausa"
                  : "Read this in English"}
              </Link>
            </p>
          )}
          <ul
            className="mt-4 flex flex-wrap gap-2 text-sm"
            aria-label="Tags"
            lang="en"
          >
            {entry.tags.map((tag) => (
              <li key={tag}>
                <Link
                  href={`/tags/${tag}`}
                  className="inline-block rounded-md bg-accent-soft px-2 py-1 text-foreground hover:underline"
                >
                  #{tag}
                </Link>
              </li>
            ))}
          </ul>
        </header>

        <div className="prose-site prose mt-10">
          <MdxContent code={entry.body} />
        </div>

        <footer className="mt-12 space-y-12" lang="en">
          <p className="text-sm">
            <a
              href={`${entry.url}.md`}
              className="text-muted underline underline-offset-4 hover:text-foreground"
            >
              View as markdown
            </a>
          </p>

          {older === undefined && newer === undefined ? null : (
            <nav
              aria-label="More posts"
              className="grid gap-4 border-y border-border py-6 sm:grid-cols-2"
            >
              {older === undefined ? (
                <span />
              ) : (
                <Link href={older.url} rel="prev" className="group">
                  <span className="block text-sm text-muted">Previous</span>
                  <span className="font-serif font-bold group-hover:underline">
                    {older.title}
                  </span>
                </Link>
              )}
              {newer === undefined ? null : (
                <Link
                  href={newer.url}
                  rel="next"
                  className="group sm:text-right"
                >
                  <span className="block text-sm text-muted">Next</span>
                  <span className="font-serif font-bold group-hover:underline">
                    {newer.title}
                  </span>
                </Link>
              )}
            </nav>
          )}

          {related.length === 0 ? null : (
            <section aria-labelledby="related">
              <h2 id="related" className="font-serif text-2xl font-bold">
                Related
              </h2>
              <div className="mt-3">
                <ItemList items={related} />
              </div>
            </section>
          )}

          <NewsletterBox />
        </footer>
      </article>

      {showToc ? (
        <aside className="hidden lg:block" lang={lang}>
          <TableOfContents entries={entry.toc} />
        </aside>
      ) : null}
    </div>
  );
}
