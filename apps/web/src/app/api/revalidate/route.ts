import { revalidateTag } from "next/cache";

import { serverEnv } from "@/env.server";
import { CONTENT_TAG, readsAdminPosts } from "@/lib/content";
import { isAuthorizedRevalidation } from "@/lib/revalidate";

/**
 * Called by the API after a publish or an edit to a published post. Expires
 * every page built from content, so the next request renders fresh data.
 */
export function POST(request: Request) {
  const secret = serverEnv.REVALIDATE_SECRET;
  // Exists only where the site reads admin posts (previews until switch-over).
  if (!readsAdminPosts || secret === undefined) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  if (!isAuthorizedRevalidation(request.headers.get("authorization"), secret)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  // expire: 0 — no stale window, so the post shows on the very next request.
  revalidateTag(CONTENT_TAG, { expire: 0 });
  return Response.json({ revalidated: true });
}
