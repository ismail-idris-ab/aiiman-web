import Link from "next/link";

import type { Item } from "@/lib/content";
import { LANG_LABELS } from "@/lib/content/model";
import { formatDate, isoDay } from "@/lib/format";

import { TypeBadge } from "./type-badge";

/** Title link for any Item: internal Entries use client navigation, Links open the external URL. */
export function ItemLink({
  item,
  className = "",
}: {
  item: Item;
  className?: string;
}) {
  const lang = item.lang === "en" ? undefined : item.lang;
  if (item.kind === "link") {
    return (
      <a
        href={item.url}
        rel="noopener noreferrer"
        lang={lang}
        className={className}
      >
        {item.title}
        <span aria-hidden="true">&nbsp;↗</span>
        <span className="sr-only"> (external)</span>
      </a>
    );
  }
  return (
    <Link href={item.url} lang={lang} className={className}>
      {item.title}
    </Link>
  );
}

export function ItemRow({
  item,
  showSummary = false,
  showDate = true,
  dataItemId,
}: {
  item: Item;
  showSummary?: boolean;
  showDate?: boolean;
  /** Hook for the archive filter island, which toggles rows in place. */
  dataItemId?: string;
}) {
  return (
    <li className="py-3" data-item-id={dataItemId}>
      <ItemLink
        item={item}
        className="font-serif text-lg leading-snug font-bold text-foreground decoration-accent decoration-2 underline-offset-4 hover:underline"
      />
      {showSummary ? (
        <p
          className="mt-1 text-muted"
          lang={item.lang === "en" ? undefined : item.lang}
        >
          {item.summary}
        </p>
      ) : null}
      <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
        <TypeBadge type={item.type} />
        {showDate ? (
          <time dateTime={isoDay(item.date)}>{formatDate(item.date)}</time>
        ) : null}
        {item.lang === "en" ? null : <span>{LANG_LABELS[item.lang]}</span>}
      </p>
    </li>
  );
}

export function ItemList({
  items,
  showSummary = false,
}: {
  items: readonly Item[];
  showSummary?: boolean;
}) {
  return (
    <ul className="divide-y divide-border">
      {items.map((item) => (
        <ItemRow
          key={`${item.kind}:${item.slug}`}
          item={item}
          showSummary={showSummary}
        />
      ))}
    </ul>
  );
}
