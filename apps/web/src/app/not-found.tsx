import type { Metadata } from "next";
import Link from "next/link";

import { OpenSearchButton } from "@/components/search/search-dialog";
import { ItemList } from "@/components/ui/item-list";
import { getLatest } from "@/lib/content";

/** Next adds `<meta name="robots" content="noindex">` to not-found responses itself; setting robots here would duplicate it. */
export const metadata: Metadata = {
  title: "Page not found",
};

export default function NotFound() {
  const latest = getLatest(5);
  return (
    <div className="max-w-measure">
      <h1 className="font-serif text-4xl font-bold tracking-tight">
        Page not found
      </h1>
      <p className="mt-3 font-serif text-xl leading-relaxed text-muted">
        This address doesn&apos;t match any page. It may have moved, or the link
        has a typo.
      </p>
      <p className="mt-6">
        <Link
          href="/writing"
          className="text-accent underline underline-offset-4"
        >
          Browse the full archive
        </Link>{" "}
        or go back to the{" "}
        <Link href="/" className="text-accent underline underline-offset-4">
          home page
        </Link>
        .
      </p>
      <p className="mt-4">
        <OpenSearchButton className="min-h-10 rounded-md border border-muted/60 px-4 text-foreground hover:border-muted" />
      </p>
      {latest.length > 0 ? (
        <section aria-labelledby="latest" className="mt-12">
          <h2 id="latest" className="font-serif text-2xl font-bold">
            Latest posts
          </h2>
          <div className="mt-3">
            <ItemList items={latest} />
          </div>
        </section>
      ) : null}
    </div>
  );
}
