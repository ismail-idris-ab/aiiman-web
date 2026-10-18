import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { MdxContent } from "@/components/mdx/mdx-content";
import { getPage } from "@/lib/content";
import { formatDate, isoDay } from "@/lib/format";

export function mdxPageMetadata(slug: string): Metadata {
  const page = getPage(slug);
  if (page === undefined) return {};
  return { title: page.title, description: page.summary };
}

/** Renders a page from content/pages/<slug>.mdx; 404s while the page is a draft in production. */
export function MdxPage({ slug, after }: { slug: string; after?: ReactNode }) {
  const page = getPage(slug);
  if (page === undefined) notFound();

  return (
    <article className="max-w-[68ch]">
      <h1 className="font-serif text-4xl font-bold tracking-tight">
        {page.title}
      </h1>
      {page.updated === undefined ? null : (
        <p className="mt-2 text-sm text-muted">
          Last updated{" "}
          <time dateTime={isoDay(page.updated)}>
            {formatDate(page.updated)}
          </time>
        </p>
      )}
      <div className="prose-site prose mt-8">
        <MdxContent code={page.body} />
      </div>
      {after}
    </article>
  );
}
