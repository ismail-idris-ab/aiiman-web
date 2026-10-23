import { notFound } from "next/navigation";

import { siteUrl } from "@/env";
import { getEntries, getEntry } from "@/lib/content";
import { buildEntryMarkdown } from "@/lib/seo/discovery";
import { canonicalUrl } from "@/lib/seo/urls";

/** Raw Markdown of each Entry. Public URL is `/<slug>.md` (rewritten in next.config). */
export const dynamic = "force-static";
// Posts published in the admin after the build render on first request, then stay cached
// until /api/revalidate expires them. Unknown slugs still 404.
export const dynamicParams = true;

export async function generateStaticParams() {
  return (await getEntries()).map((entry) => ({ slug: entry.slug }));
}

export async function GET(
  _request: Request,
  { params }: RouteContext<"/md/[slug]">,
) {
  const entry = await getEntry((await params).slug);
  if (entry === undefined) notFound();
  return new Response(buildEntryMarkdown(siteUrl, entry), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "X-Robots-Tag": "noindex",
      Link: `<${canonicalUrl(siteUrl, entry)}>; rel="canonical"`,
    },
  });
}
