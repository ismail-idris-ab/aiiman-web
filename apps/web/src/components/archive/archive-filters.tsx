"use client";

import { useSearchParams } from "next/navigation";
import {
  Suspense,
  useEffect,
  useId,
  useMemo,
  useRef,
  type ReactNode,
} from "react";

import {
  EMPTY_FILTERS,
  isFiltered,
  matchesFilters,
  parseFilters,
  toQueryString,
  type ArchiveFilters,
  type ArchiveItemMeta,
} from "@/lib/archive-filter";
import {
  LANG_LABELS,
  TYPE_LABELS,
  type ItemType,
  type Lang,
} from "@/lib/content/model";

interface Props {
  items: readonly ArchiveItemMeta[];
  types: readonly ItemType[];
  tags: readonly string[];
  langs: readonly Lang[];
  /** id of the server-rendered list whose rows (data-item-id) and year groups (data-year) are filtered in place. */
  listId: string;
}

/**
 * Filters the server-rendered archive in place. URL changes use the native
 * History API, which Next syncs into useSearchParams: no RSC request, and the
 * back button restores the previous filter.
 */
export function ArchiveFilterBar(props: Props) {
  return (
    <Suspense
      fallback={<FilterForm {...props} filters={EMPTY_FILTERS} disabled />}
    >
      <FilterBarWithParams {...props} />
    </Suspense>
  );
}

function FilterBarWithParams(props: Props) {
  const params = useSearchParams();
  const filters = useMemo(() => parseFilters(params), [params]);
  return <FilterForm {...props} filters={filters} />;
}

function navigate(next: ArchiveFilters, mode: "push" | "replace") {
  const url = `${window.location.pathname}${toQueryString(next)}`;
  if (mode === "push") window.history.pushState(null, "", url);
  else window.history.replaceState(null, "", url);
}

/** Label above control, linked by id so the accessible name is just the label. */
function Field({
  id,
  label,
  children,
  className = "",
}: {
  id: string;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={id} className="text-sm text-muted">
        {label}
      </label>
      {children}
    </div>
  );
}

const CONTROL_CLASS =
  "h-10 w-full rounded-md border border-muted/60 bg-background px-2 text-foreground disabled:opacity-60";

function FilterForm({
  items,
  types,
  tags,
  langs,
  listId,
  filters,
  disabled = false,
}: Props & { filters: ArchiveFilters; disabled?: boolean }) {
  const matching = useMemo(
    () =>
      new Set(
        items
          .filter((item) => matchesFilters(item, filters))
          .map((item) => item.id),
      ),
    [items, filters],
  );
  const filtered = isFiltered(filters);
  const queryInput = useRef<HTMLInputElement>(null);
  const formId = useId();
  const ids = {
    q: `${formId}-q`,
    type: `${formId}-type`,
    tag: `${formId}-tag`,
    lang: `${formId}-lang`,
  };

  // Sync visibility onto the server-rendered rows. DOM-only: no state is set here.
  useEffect(() => {
    const list = document.getElementById(listId);
    if (list === null) return;
    for (const row of list.querySelectorAll<HTMLElement>("[data-item-id]")) {
      row.hidden = !matching.has(row.dataset.itemId ?? "");
    }
    for (const group of list.querySelectorAll<HTMLElement>("[data-year]")) {
      group.hidden =
        group.querySelector("[data-item-id]:not([hidden])") === null;
    }
  }, [listId, matching]);

  // Keep the text box in step with the URL (e.g. after back/forward) without making it controlled.
  useEffect(() => {
    if (
      queryInput.current !== null &&
      document.activeElement !== queryInput.current
    ) {
      queryInput.current.value = filters.q;
    }
  }, [filters.q]);

  const update = (
    patch: Partial<ArchiveFilters>,
    mode: "push" | "replace" = "push",
  ) => navigate({ ...filters, ...patch }, mode);

  const count = matching.size;

  return (
    <div className="space-y-4">
      <form
        role="search"
        aria-label="Filter the archive"
        onSubmit={(event) => event.preventDefault()}
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        <Field
          id={ids.q}
          label="Search this list"
          className="col-span-2 lg:col-span-1"
        >
          <input
            ref={queryInput}
            id={ids.q}
            type="search"
            name="q"
            defaultValue={filters.q}
            disabled={disabled}
            maxLength={100}
            onChange={(event) =>
              update({ q: event.target.value.trim() }, "replace")
            }
            className={CONTROL_CLASS}
          />
        </Field>
        <Field id={ids.type} label="Type">
          <select
            id={ids.type}
            name="type"
            value={filters.type ?? ""}
            disabled={disabled}
            onChange={(event) =>
              update({
                type: (event.target.value || undefined) as ItemType | undefined,
              })
            }
            className={CONTROL_CLASS}
          >
            <option value="">All types</option>
            {types.map((type) => (
              <option key={type} value={type}>
                {TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </Field>
        <Field id={ids.tag} label="Tag">
          <select
            id={ids.tag}
            name="tag"
            value={filters.tag ?? ""}
            disabled={disabled}
            onChange={(event) =>
              update({ tag: event.target.value || undefined })
            }
            className={CONTROL_CLASS}
          >
            <option value="">All tags</option>
            {tags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        </Field>
        <Field
          id={ids.lang}
          label="Language"
          className="col-span-2 sm:col-span-1"
        >
          <select
            id={ids.lang}
            name="lang"
            value={filters.lang ?? ""}
            disabled={disabled}
            onChange={(event) =>
              update({
                lang: (event.target.value || undefined) as Lang | undefined,
              })
            }
            className={CONTROL_CLASS}
          >
            <option value="">All languages</option>
            {langs.map((lang) => (
              <option key={lang} value={lang}>
                {LANG_LABELS[lang]}
              </option>
            ))}
          </select>
        </Field>
      </form>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <p aria-live="polite" className="text-muted">
          {count} {count === 1 ? "entry" : "entries"}
          {filtered ? " match these filters" : ""}
        </p>
        {filtered ? (
          <button
            type="button"
            onClick={() => {
              if (queryInput.current !== null) queryInput.current.value = "";
              navigate(EMPTY_FILTERS, "push");
            }}
            className="min-h-8 text-accent underline underline-offset-4"
          >
            Clear filters
          </button>
        ) : null}
      </div>

      {count === 0 ? (
        <p className="rounded-lg bg-accent-soft px-4 py-6 text-center">
          Nothing matches these filters. Try a different tag or type, or clear
          the filters to see everything.
        </p>
      ) : null}
    </div>
  );
}
