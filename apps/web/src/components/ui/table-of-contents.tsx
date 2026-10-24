interface TocEntry {
  title: string;
  url: string;
  items: TocEntry[];
}

export const countHeadings = (entries: readonly TocEntry[]): number =>
  entries.reduce((sum, entry) => sum + 1 + countHeadings(entry.items), 0);

function TocList({
  entries,
  nested = false,
}: {
  entries: readonly TocEntry[];
  nested?: boolean;
}) {
  return (
    <ol className={nested ? "mt-1 ml-3 space-y-1" : "space-y-1.5"}>
      {entries.map((entry) => (
        <li key={entry.url}>
          <a
            href={entry.url}
            className="block leading-snug text-muted hover:text-foreground"
          >
            {entry.title}
          </a>
          {entry.items.length > 0 ? (
            <TocList entries={entry.items} nested />
          ) : null}
        </li>
      ))}
    </ol>
  );
}

/** Sticky table of contents for wide screens. Hidden below lg, where it would push the body down. */
export function TableOfContents({ entries }: { entries: readonly TocEntry[] }) {
  return (
    <nav
      aria-labelledby="toc-heading"
      className="sticky top-8 hidden text-sm lg:block"
    >
      <h2 id="toc-heading" className="mb-2 font-semibold text-foreground">
        On this page
      </h2>
      <TocList entries={entries} />
    </nav>
  );
}
