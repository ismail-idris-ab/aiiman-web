import { OG_CONTENT_TYPE, OG_SIZE, renderOgCard } from "@/lib/seo/og-card";
import { siteConfig } from "@/site.config";

export const alt = `${siteConfig.author.name}: ${siteConfig.author.bio}`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderOgCard({
    title: siteConfig.author.name,
    subtitle: siteConfig.author.bio,
    hideByline: true,
  });
}
