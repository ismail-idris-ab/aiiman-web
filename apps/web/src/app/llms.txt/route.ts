import { siteUrl } from "@/env";
import { content } from "@/lib/content";
import { buildLlmsTxt } from "@/lib/seo/discovery";

export const dynamic = "force-static";

export function GET() {
  return new Response(buildLlmsTxt(siteUrl, content), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
