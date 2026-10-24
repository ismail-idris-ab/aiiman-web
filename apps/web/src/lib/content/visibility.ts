/**
 * Which Items exist for a given build. Pure, shared by the app and build scripts.
 *
 * - "authoring" (next dev, Vercel previews): drafts and Scheduled Items are shown.
 * - "published" (production builds): only non-draft Items whose date has arrived in WAT.
 */

import { calendarDate } from "@aiiman/shared/vocab";

export type VisibilityMode = "authoring" | "published";

export interface VisibilityEnv {
  NODE_ENV?: string | undefined;
  VERCEL_ENV?: string | undefined;
}

export function visibilityModeFor(env: VisibilityEnv): VisibilityMode {
  if (env.VERCEL_ENV === "preview" || env.VERCEL_ENV === "development")
    return "authoring";
  if (env.VERCEL_ENV === "production") return "published";
  return env.NODE_ENV === "development" ? "authoring" : "published";
}

export { calendarDate };

/** Frontmatter dates are calendar dates; Velite stores them as UTC-midnight ISO strings. */
export const dateKey = (isoDate: string): string => isoDate.slice(0, 10);

export function isScheduled(
  isoDate: string,
  now: Date,
  timeZone: string,
): boolean {
  return dateKey(isoDate) > calendarDate(now, timeZone);
}

export function isVisible(
  item: { draft: boolean; date: string },
  mode: VisibilityMode,
  now: Date,
  timeZone: string,
): boolean {
  if (mode === "authoring") return true;
  return !item.draft && !isScheduled(item.date, now, timeZone);
}
