import { siteUrl } from "@/env";
import { getLatest } from "@/lib/content";
import { buildJsonFeed, FEED_ITEM_LIMIT } from "@/lib/seo/feeds";

export const dynamic = "force-static";

export function GET() {
  return new Response(buildJsonFeed(siteUrl, getLatest(FEED_ITEM_LIMIT)), {
    headers: { "Content-Type": "application/feed+json; charset=utf-8" },
  });
}
