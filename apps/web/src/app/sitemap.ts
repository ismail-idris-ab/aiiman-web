import type { MetadataRoute } from "next";

import { siteUrl } from "@/env";
import { content } from "@/lib/content";
import { buildSitemap } from "@/lib/seo/discovery";

export default function sitemap(): MetadataRoute.Sitemap {
  return buildSitemap(siteUrl, content);
}
