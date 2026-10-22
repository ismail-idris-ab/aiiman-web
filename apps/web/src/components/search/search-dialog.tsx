"use client";

import type MiniSearch from "minisearch";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useEffectEvent,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import { TypeBadge } from "@/components/ui/type-badge";
import {
  SEARCH_INDEX_PATH,
  searchIndexOptions,
  searchQueryOptions,
  type SearchDocument,
  type SearchResultFields,
} from "@/lib/search";

const OPEN_EVENT = "site:open-search";
const MAX_RESULTS = 8;

type Status = "idle" | "loading" | "ready" | "error";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
  );
}

/** Opens the site search from anywhere (e.g. the 404 page) without importing the dialog. */
export function OpenSearchButton({ className = "" }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}
      className={className}
    >
      Search the site
    </button>
  );
}

export function SearchDialog() {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [index, setIndex] = useState<MiniSearch<SearchDocument> | null>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listboxId = useId();
  const optionId = (i: number) => `${listboxId}-option-${i}`;

  async function loadIndex() {
    if (status === "loading" || status === "ready") return;
    setStatus("loading");
    try {
      const [{ default: MiniSearchClass }, json] = await Promise.all([
        import("minisearch"),
        fetch(SEARCH_INDEX_PATH).then((response) => {
          if (!response.ok)
            throw new Error(`search index: HTTP ${response.status}`);
          return response.text();
        }),
      ]);
      setIndex(
        MiniSearchClass.loadJSON<SearchDocument>(json, searchIndexOptions),
      );
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }

  function open() {
    const dialog = dialogRef.current;
    if (dialog === null || dialog.open) return;
    returnFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    dialog.showModal();
    inputRef.current?.select();
    void loadIndex();
  }

  function close() {
    dialogRef.current?.close();
  }

  // Global shortcuts and the open event. Only subscribes; never sets state.
  const openFromOutside = useEffectEvent(open);
  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      const isShortcut =
        (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      const isSlash = event.key === "/" && !isTypingTarget(event.target);
      if (isShortcut || isSlash) {
        event.preventDefault();
        openFromOutside();
      }
    }
    const onOpenEvent = () => openFromOutside();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(OPEN_EVENT, onOpenEvent);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(OPEN_EVENT, onOpenEvent);
    };
  }, []);

  const results = useMemo<SearchResultFields[]>(() => {
    const term = query.trim();
    if (index === null || term === "") return [];
    return index
      .search(term, searchQueryOptions)
      .slice(0, MAX_RESULTS)
      .map((hit) => ({
        id: String(hit.id),
        title: String(hit.title),
        summary: String(hit.summary),
        url: String(hit.url),
        type: hit.type as SearchResultFields["type"],
        lang: hit.lang as SearchResultFields["lang"],
        date: String(hit.date),
        dateLabel: String(hit.dateLabel),
        external: hit.external === true,
      }));
  }, [index, query]);

  function go(result: SearchResultFields) {
    close();
    if (result.external) window.location.assign(result.url);
    else router.push(result.url);
  }

  function onInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (results.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => (i - 1 + results.length) % results.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const result = results[active];
      if (result !== undefined) go(result);
    }
  }

  const term = query.trim();
  const statusText =
    status === "loading"
      ? "Loading search…"
      : status === "error"
        ? "Search couldn't load. Check your connection and try again."
        : term === ""
          ? ""
          : results.length === 0
            ? `No results for “${term}”.`
            : `${results.length} ${results.length === 1 ? "result" : "results"}`;

  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-haspopup="dialog"
        className="inline-flex h-9 items-center gap-2 rounded-md border border-muted/50 px-2 text-sm text-muted hover:border-muted hover:text-foreground"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <circle cx="7" cy="7" r="4.5" />
          <path d="m10.5 10.5 3 3" strokeLinecap="round" />
        </svg>
        <span className="sr-only sm:not-sr-only">Search</span>
        <kbd className="hidden rounded border border-border px-1 font-sans text-xs sm:inline">
          ⌘K
        </kbd>
      </button>

      <dialog
        ref={dialogRef}
        aria-label="Search the site"
        onClose={() => {
          setQuery("");
          setActive(0);
          returnFocus.current?.focus();
        }}
        onClick={(event) => {
          if (event.target === dialogRef.current) close();
        }}
        className="mx-auto mt-[10vh] w-[min(40rem,calc(100vw-2rem))] rounded-lg border border-border bg-background p-0 text-foreground shadow-xl backdrop:bg-black/50"
      >
        <div className="flex items-center gap-2 border-b border-border px-4">
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            className="h-4 w-4 shrink-0 text-muted"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <circle cx="7" cy="7" r="4.5" />
            <path d="m10.5 10.5 3 3" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            enterKeyHint="search"
            autoComplete="off"
            spellCheck={false}
            role="combobox"
            aria-label="Search posts"
            aria-expanded={results.length > 0}
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={
              results.length > 0 ? optionId(active) : undefined
            }
            placeholder="Search essays, notes, tutorials…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={onInputKeyDown}
            className="h-14 w-full bg-transparent text-lg outline-none placeholder:text-muted"
          />
          <button
            type="button"
            onClick={close}
            className="min-h-8 shrink-0 rounded px-2 text-sm text-muted hover:text-foreground"
          >
            Close
          </button>
        </div>

        <p
          aria-live="polite"
          className="px-4 pt-3 text-sm text-muted empty:hidden"
        >
          {statusText}
        </p>

        <ul
          id={listboxId}
          role="listbox"
          aria-label="Search results"
          className="max-h-[60vh] overflow-y-auto p-2"
        >
          {results.map((result, i) => (
            <li
              key={result.id}
              id={optionId(i)}
              role="option"
              aria-selected={i === active}
              onMouseMove={() => setActive(i)}
              onClick={() => go(result)}
              className="cursor-pointer rounded-md px-3 py-2 aria-selected:bg-accent-soft"
            >
              <span
                className="block font-serif font-bold"
                lang={result.lang === "en" ? undefined : result.lang}
              >
                {result.title}
                {result.external ? (
                  <span aria-hidden="true">&nbsp;↗</span>
                ) : null}
              </span>
              <span className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sm text-muted">
                <TypeBadge type={result.type} />
                <time dateTime={result.date.slice(0, 10)}>
                  {result.dateLabel}
                </time>
                {result.external ? (
                  <span className="sr-only">(external)</span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </dialog>
    </>
  );
}
