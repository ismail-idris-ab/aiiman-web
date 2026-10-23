import type { Logger } from "./app.js";

export interface RevalidatorConfig {
  /** The site's revalidation endpoint, e.g. https://<site>/api/revalidate. */
  url: string | undefined;
  secret: string | undefined;
  /** Vercel "Protection Bypass for Automation" secret, when the site's previews are protected. */
  protectionBypass?: string | undefined;
  fetch?: typeof fetch;
  log: Logger;
  timeoutMs?: number;
}

/** Asks the site to refresh its content. Resolves false instead of throwing: publishing must not fail on it. */
export type SiteRevalidator = () => Promise<boolean>;

export function createSiteRevalidator({
  url,
  secret,
  protectionBypass,
  fetch: fetcher = fetch,
  log,
  timeoutMs = 5000,
}: RevalidatorConfig): SiteRevalidator {
  return async () => {
    if (url === undefined || secret === undefined) {
      log("api.revalidate_not_configured");
      return false;
    }
    const headers: Record<string, string> = {
      authorization: `Bearer ${secret}`,
    };
    if (protectionBypass !== undefined) {
      headers["x-vercel-protection-bypass"] = protectionBypass;
    }
    try {
      const res = await fetcher(url, {
        method: "POST",
        headers,
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
  };
}
