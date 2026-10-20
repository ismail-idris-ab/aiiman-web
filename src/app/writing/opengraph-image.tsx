import { OG_CONTENT_TYPE, OG_SIZE, renderOgCard } from "@/lib/seo/og-card";
import { siteConfig } from "@/site.config";

export const alt = `Writing by ${siteConfig.author.name}: essays, notes, tutorials and talks`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderOgCard({
    title: "Writing",
    subtitle: "Essays, notes, tutorials and talks, all in one archive.",
  });
}
