import { siteUrl } from "@/env";
import { getContent } from "@/lib/content";
import { buildLlmsTxt } from "@/lib/seo/discovery";

export const dynamic = "force-static";

export async function GET() {
  return new Response(buildLlmsTxt(siteUrl, await getContent()), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
