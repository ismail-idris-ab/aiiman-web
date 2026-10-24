import type { Metadata } from "next";

import { NewsletterBox } from "@/components/newsletter/newsletter-box";
import { pageMetadata } from "@/lib/seo/metadata";
import { siteConfig } from "@/site.config";

export const metadata: Metadata = pageMetadata({
  title: "Subscribe",
  description: `Get new essays, notes and tutorials from ${siteConfig.author.name} by email, or follow along with the RSS and JSON feeds.`,
  path: "/subscribe",
});

export default function SubscribePage() {
  return (
    <div className="max-w-measure">
      <h1 className="font-serif text-4xl font-bold tracking-tight">
        Subscribe
      </h1>
      <p className="mt-3 font-serif text-xl leading-relaxed text-muted">
        New posts arrive a few times a month. Pick whichever way of following
        suits you.
      </p>
      <div className="mt-10">
        <NewsletterBox />
      </div>
      <section aria-labelledby="feeds" className="mt-12">
        <h2 id="feeds" className="font-serif text-2xl font-bold">
          Feeds
        </h2>
        <p className="mt-2">
          Use any feed reader with the{" "}
          <a
            href="/rss.xml"
            className="text-accent underline underline-offset-4"
          >
            RSS feed
          </a>{" "}
          or the{" "}
          <a
            href="/feed.json"
            className="text-accent underline underline-offset-4"
          >
            JSON feed
          </a>
          .
        </p>
      </section>
    </div>
  );
}
