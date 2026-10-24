import { createPreviewToken } from "@aiiman/shared/preview-token";
import type { Logger } from "./app.js";

export interface SiteConfig {
  /** The site's origin, e.g. https://aiiman-web-git-main.vercel.app. */
  url: string | undefined;
  /** Shared with the site as SITE_API_SECRET: authenticates revalidation and signs previews. */
  secret: string | undefined;
  /** Vercel "Protection Bypass for Automation" secret, when the site's previews are protected. */
  protectionBypass?: string | undefined;
  fetch?: typeof fetch;
  log: Logger;
  now: () => Date;
  timeoutMs?: number;
}

export interface SearchPreview {
  title: string;
  description: string;
  url: string;
  indexed: boolean;
}

/** Thrown when previews are asked for but the site connection isn't configured or answering. */
export class SiteUnavailableError extends Error {
  override name = "SiteUnavailableError";
}

export interface SiteClient {
  /** Asks the site to refresh its content. False instead of throwing: publishing must not fail on it. */
  revalidate(): Promise<boolean>;
  /** Opens the post in the site's draft mode; valid for 15 minutes. */
  readerUrl(postId: string): string;
  /** Title, description and URL exactly as the site renders them. */
  searchPreview(postId: string): Promise<SearchPreview>;
  /** The site's share card for the post, as PNG bytes. */
  shareImage(postId: string): Promise<ArrayBuffer>;
}

export function createSiteClient({
  url,
  secret,
  protectionBypass,
  fetch: fetcher = fetch,
  log,
  now,
  timeoutMs = 10_000,
}: SiteConfig): SiteClient {
  const configured = () => {
    if (url === undefined || secret === undefined) {
      throw new SiteUnavailableError("SITE_URL or SITE_API_SECRET is not set");
    }
    return { url, secret };
  };

  const headers = (extra: Record<string, string> = {}) => ({
    ...extra,
    ...(protectionBypass === undefined
      ? {}
      : { "x-vercel-protection-bypass": protectionBypass }),
  });

  const draftUrl = (path: string, postId: string) => {
    const site = configured();
    const target = new URL(path, site.url);
    target.searchParams.set(
      "token",
      createPreviewToken(postId, site.secret, now()),
    );
    return target;
  };

  const get = async (target: URL): Promise<Response> => {
    try {
      const res = await fetcher(target, {
        headers: headers(),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) return res;
      log("api.site_preview_failed", { status: res.status });
    } catch (error) {
      log("api.site_preview_failed", {
        error: error instanceof Error ? error.name : typeof error,
      });
    }
    throw new SiteUnavailableError("site preview request failed");
  };

  return {
    async revalidate() {
      if (url === undefined || secret === undefined) {
        log("api.revalidate_not_configured");
        return false;
      }
      try {
        const res = await fetcher(new URL("/api/revalidate", url), {
          method: "POST",
          headers: headers({ authorization: `Bearer ${secret}` }),
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) log("api.revalidate_failed", { status: res.status });
        return res.ok;
      } catch (error) {
        log("api.revalidate_failed", {
          error: error instanceof Error ? error.name : typeof error,
        });
        return false;
      }
    },

    readerUrl(postId) {
      return draftUrl("/api/draft", postId).toString();
    },

    async searchPreview(postId) {
      const res = await get(draftUrl("/api/draft/seo", postId));
      const body = (await res.json()) as Record<string, unknown>;
      const { title, description, url: pageUrl, indexed } = body;
      if (
        typeof title !== "string" ||
        typeof description !== "string" ||
        typeof pageUrl !== "string" ||
        typeof indexed !== "boolean"
      ) {
        throw new SiteUnavailableError("unexpected search preview");
      }
      return { title, description, url: pageUrl, indexed };
    },

    async shareImage(postId) {
      const res = await get(draftUrl("/api/draft/og", postId));
      return res.arrayBuffer();
    },
  };
}
