/**
 * Which Items exist for a given build. Pure, shared by the app and build scripts.
 *
 * - "authoring" (next dev, Vercel previews): drafts and Scheduled Items are shown.
 * - "published" (production builds): only non-draft Items whose date has arrived in WAT.
 */

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

/** Calendar date (YYYY-MM-DD) of `now` in the given IANA time zone. */
export function calendarDate(now: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

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
