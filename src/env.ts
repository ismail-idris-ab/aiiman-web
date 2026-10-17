import { parseClientEnv } from "@/lib/env-schema";
import { siteConfig } from "@/site.config";

/** Client-safe env. Each NEXT_PUBLIC_* key is referenced literally so Next can inline it. */
export const clientEnv = parseClientEnv({
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
});

/** Absolute origin used for canonicals, feeds and OG URLs. No trailing slash. */
export const siteUrl = (
  clientEnv.NEXT_PUBLIC_SITE_URL ?? siteConfig.url
).replace(/\/+$/, "");
