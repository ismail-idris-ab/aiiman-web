import { siteUrl } from "@/env";
import { getLatest } from "@/lib/content";
import { buildRss, FEED_ITEM_LIMIT } from "@/lib/seo/feeds";

export const dynamic = "force-static";

export function GET() {
  return new Response(buildRss(siteUrl, getLatest(FEED_ITEM_LIMIT)), {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
