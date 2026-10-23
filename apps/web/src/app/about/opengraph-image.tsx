import { getPage } from "@/lib/content";
import { OG_CONTENT_TYPE, OG_SIZE, renderOgCard } from "@/lib/seo/og-card";
import { siteConfig } from "@/site.config";

const page = await getPage("about");

export const alt = `${page?.title ?? "About"}, ${siteConfig.name}`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderOgCard({
    title: page?.title ?? "About",
    ...(page === undefined ? {} : { subtitle: page.summary }),
  });
}
