import "server-only";

import { siteConfig } from "@/site.config";

/** Frontmatter dates are calendar dates stored as UTC midnight; format in UTC so the day never shifts. */
const dateFormat = new Intl.DateTimeFormat(siteConfig.locale, {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** "17 Oct 2026". Server-only so the output never differs between server and browser. */
export const formatDate = (iso: string): string =>
  dateFormat.format(new Date(iso));

/** "2026-10-17", for <time dateTime>. */
export const isoDay = (iso: string): string => iso.slice(0, 10);

export const yearOf = (iso: string): string => iso.slice(0, 4);

export const formatReadingTime = (minutes: number): string =>
  `${Math.max(1, Math.round(minutes))} min read`;
