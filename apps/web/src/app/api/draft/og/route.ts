import { loadPreview, previewsEnabled } from "@/lib/preview";
import { entryOgCard } from "@/lib/seo/entry-og";
import { renderOgCard } from "@/lib/seo/og-card";

/** For the admin's share preview: the post's share card, from the renderer its page uses. */
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
  const image = await renderOgCard(entryOgCard(preview.entry));
  image.headers.set("Cache-Control", "no-store");
  return image;
}
