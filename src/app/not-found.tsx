import type { Metadata } from "next";
import Link from "next/link";

import { ItemList } from "@/components/ui/item-list";
import { getLatest } from "@/lib/content";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  const latest = getLatest(5);
  return (
    <div className="max-w-[68ch]">
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
