import { OG_CONTENT_TYPE, OG_SIZE, renderOgCard } from "@/lib/seo/og-card";
import { siteConfig } from "@/site.config";

export const alt = `Subscribe to ${siteConfig.name} by email or feed`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderOgCard({
    title: "Subscribe",
    subtitle: "New posts by email, RSS or JSON feed.",
  });
}
