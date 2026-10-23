import type { MetadataRoute } from "next";

import { siteUrl } from "@/env";
import { getContent } from "@/lib/content";
import { buildSitemap } from "@/lib/seo/discovery";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return buildSitemap(siteUrl, await getContent());
}
