import { siteUrl } from "@/env";
import { loadPreview, previewsEnabled } from "@/lib/preview";
import { entrySearchPreview } from "@/lib/seo/metadata";

/** For the admin's search-result preview: the title, description and URL this site renders. */
export async function GET(request: Request) {
  if (!previewsEnabled) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  const preview = await loadPreview(
    new URL(request.url).searchParams.get("token"),
  );
  if (preview === null) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return Response.json(entrySearchPreview(siteUrl, preview.entry), {
    headers: { "Cache-Control": "no-store" },
  });
}
