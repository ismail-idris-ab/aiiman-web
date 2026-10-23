import "server-only";

import { verifyPreviewToken } from "@aiiman/shared/preview-token";
import { cookies, draftMode } from "next/headers";

import { serverEnv } from "@/env.server";
import { adminApiUrl, type Entry } from "@/lib/content";
import { fetchPreviewPost, postToEntry } from "@/lib/content/api-source";

/** Holds the preview token while draft mode is on, so pages know which post to show. */
export const PREVIEW_COOKIE = "aiiman_preview";

/** Draft previews exist where the site reads admin posts and shares a secret with the API. */
export const previewsEnabled =
  adminApiUrl !== undefined && serverEnv.SITE_API_SECRET !== undefined;

export interface Preview {
  entry: Entry;
  expires: Date;
}

/** The post a preview token names, as an Entry; null when the token or post is invalid. */
export async function loadPreview(
  token: string | null | undefined,
): Promise<Preview | null> {
  const secret = serverEnv.SITE_API_SECRET;
  if (adminApiUrl === undefined || secret === undefined || !token) return null;
  const verified = verifyPreviewToken(token, secret, new Date());
  if (verified === null) return null;
  const post = await fetchPreviewPost(
    adminApiUrl,
    verified.postId,
    secret,
    fetch,
  );
  if (post === null) return null;
  return {
    entry: postToEntry(post, { draft: post.status !== "published" }),
    expires: verified.expires,
  };
}

/** In draft mode, the previewed post when it lives at `slug`. */
export async function previewEntryFor(
  slug: string,
): Promise<Entry | undefined> {
  if (!previewsEnabled || !(await draftMode()).isEnabled) return undefined;
  const preview = await loadPreview(
    (await cookies()).get(PREVIEW_COOKIE)?.value,
  );
  return preview?.entry.slug === slug ? preview.entry : undefined;
}
