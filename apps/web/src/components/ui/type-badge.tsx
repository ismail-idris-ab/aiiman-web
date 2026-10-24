import type { ReactNode } from "react";

import { TYPE_LABELS, type ItemType } from "@/lib/content/model";

/** 16px line icons; each type has a distinct shape so the badge never relies on color. */
const ICONS: Record<ItemType, ReactNode> = {
  essay: <path d="M3 3h10M3 6h10M3 9h10M3 12h6" />,
  note: <path d="M3 2.5h7l3 3v8H3zM10 2.5v3h3" />,
  tutorial: (
    <path d="M2.5 4.5 8 2l5.5 2.5L8 7zM4.5 6v4c1 1.2 2.2 1.8 3.5 1.8s2.5-.6 3.5-1.8V6" />
  ),
  snippet: <path d="m5.5 4.5-3 3.5 3 3.5M10.5 4.5l3 3.5-3 3.5" />,
  video: <path d="M2.5 4h7.5v8H2.5zM10 7l3.5-2v6L10 9" />,
  podcast: (
    <path d="M8 2.5a2 2 0 0 1 2 2v3a2 2 0 0 1-4 0v-3a2 2 0 0 1 2-2zM4.5 7.5a3.5 3.5 0 0 0 7 0M8 11v2.5" />
  ),
  talk: <path d="M2.5 3h11v7h-6l-3 3v-3h-2z" />,
  "guest-post": <path d="M3 3h7v10H3zM10 6h3v7h-3M5 6h3M5 9h3" />,
};

export function TypeBadge({ type }: { type: ItemType }) {
  return (
    <span className="inline-flex items-center gap-1 text-sm text-muted">
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        className="h-4 w-4 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {ICONS[type]}
      </svg>
      {TYPE_LABELS[type]}
    </span>
  );
}
