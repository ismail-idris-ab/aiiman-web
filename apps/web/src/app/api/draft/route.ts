import { cookies, draftMode } from "next/headers";
import { redirect } from "next/navigation";

import { loadPreview, PREVIEW_COOKIE, previewsEnabled } from "@/lib/preview";

/**
 * The admin's "Open reader preview" link: verifies the signed token, turns
 * on draft mode and shows the post at its own URL, rendered like any page.
 */
export async function GET(request: Request) {
  if (!previewsEnabled) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  const token = new URL(request.url).searchParams.get("token");
  const preview = await loadPreview(token);
  if (token === null || preview === null) {
    return new Response(
      "This preview link has expired. Open the preview again from the admin.",
      { status: 401, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }
  (await draftMode()).enable();
  (await cookies()).set(PREVIEW_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    expires: preview.expires,
  });
  redirect(preview.entry.url);
}
