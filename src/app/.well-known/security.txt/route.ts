import { siteUrl } from "@/env";
import { buildSecurityTxt } from "@/lib/seo/discovery";

/** Built once per deploy; the daily rebuild keeps `Expires` in the future. */
export const dynamic = "force-static";

export function GET() {
  return new Response(buildSecurityTxt(siteUrl, new Date()), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
