import type { MetadataRoute } from "next";

import { siteUrl } from "@/env";
import { serverEnv } from "@/env.server";
import { isIndexableDeploy } from "@/lib/seo/deploy";
import { buildRobots } from "@/lib/seo/discovery";

export default function robots(): MetadataRoute.Robots {
  return buildRobots(siteUrl, isIndexableDeploy(serverEnv.VERCEL_ENV));
}
