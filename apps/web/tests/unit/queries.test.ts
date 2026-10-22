import MiniSearch from "minisearch";
import { describe, expect, it } from "vitest";

import { createContentQueries, type QueryOptions } from "@/lib/content/queries";
import {
  searchIndexOptions,
  searchQueryOptions,
  type SearchDocument,
} from "@/lib/search";
import { buildSearchIndex } from "@/lib/search-index";

import { entry, link, page, project } from "./fixtures";

const published: QueryOptions = {
  mode: "published",
  now: new Date("2026-10-17T12:00:00Z"),
  timeZone: "Africa/Lagos",
};

const entries = [
  entry("oldest", { date: "2026-01-01T00:00:00.000Z", tags: ["react", "web"] }),
  entry("middle", {
    date: "2026-05-01T00:00:00.000Z",
    tags: ["react"],
    featured: 2,
  }),
  entry("newest", {
    date: "2026-09-01T00:00:00.000Z",
    tags: ["react", "web"],
    type: "note",
  }),
  entry("hausa", {
    date: "2026-09-02T00:00:00.000Z",
    lang: "ha",
    translationOf: "newest",
    tags: ["react", "web"],
  }),
  entry("draft", { draft: true, tags: ["react"] }),
  entry("future", { date: "2026-12-01T00:00:00.000Z", tags: ["react"] }),
];
const links = [
  link("talk", {
    date: "2026-06-01T00:00:00.000Z",
    tags: ["web"],
    featured: 1,
  }),
];
const source = {
  entries,
  links,
  projects: [
    project("b", { order: 2, featured: true }),
    project("a", { order: 1 }),
    project("hidden", { draft: true, order: 0 }),
  ],
  pages: [page("about"), page("uses", { draft: true })],
};

const q = createContentQueries(source, published);

describe("visibility in published mode", () => {
  it("excludes drafts and scheduled entries everywhere", () => {
    const slugs = q.getItems().map((i) => i.slug);
    expect(slugs).not.toContain("draft");
    expect(slugs).not.toContain("future");
    expect(q.getEntry("draft")).toBeUndefined();
    expect(q.getByTag("react").map((i) => i.slug)).not.toContain("future");
  });

  it("excludes draft projects and pages", () => {
    expect(q.getProjects().map((p) => p.slug)).toEqual(["a", "b"]);
    expect(q.getPage("uses")).toBeUndefined();
    expect(q.getPage("about")).toBeDefined();
  });

  it("includes drafts and scheduled items in authoring mode", () => {
    const authoring = createContentQueries(source, {
      ...published,
      mode: "authoring",
    });
    expect(authoring.getEntry("draft")).toBeDefined();
    expect(authoring.previewReason(authoring.getEntry("draft")!)).toBe("draft");
    expect(authoring.previewReason(authoring.getEntry("future")!)).toBe(
      "scheduled",
    );
    expect(
      authoring.previewReason(authoring.getEntry("newest")!),
    ).toBeUndefined();
  });
});

describe("ordering and lookups", () => {
  it("sorts items newest first, mixing entries and links", () => {
    expect(q.getItems().map((i) => i.slug)).toEqual([
      "hausa",
      "newest",
      "talk",
      "middle",
      "oldest",
    ]);
    expect(q.getLatest(2).map((i) => i.slug)).toEqual(["hausa", "newest"]);
  });

  it("orders featured items by position", () => {
    expect(q.getFeatured().map((i) => i.slug)).toEqual(["talk", "middle"]);
    expect(q.getFeaturedProjects().map((p) => p.slug)).toEqual(["b"]);
  });

  it("counts tags across entries and links", () => {
    expect(q.getTags()).toEqual([
      { tag: "react", count: 4 },
      { tag: "web", count: 4 },
    ]);
    expect(q.getTagCount("missing")).toBe(0);
  });

  it("filters by type, tag and lang together", () => {
    expect(
      q.filterItems({ tag: "web", lang: "en" }).map((i) => i.slug),
    ).toEqual(["newest", "talk", "oldest"]);
    expect(q.filterItems({ type: "note" }).map((i) => i.slug)).toEqual([
      "newest",
    ]);
  });

  it("pairs translations in both directions", () => {
    expect(q.getTranslation(q.getEntry("newest")!)?.slug).toBe("hausa");
    expect(q.getTranslation(q.getEntry("hausa")!)?.slug).toBe("newest");
    expect(q.getTranslation(q.getEntry("oldest")!)).toBeUndefined();
  });
});

describe("getRelated", () => {
  it("scores by shared tags, then recency, excluding self and translation", () => {
    expect(q.getRelated(q.getEntry("newest")!).map((e) => e.slug)).toEqual([
      "oldest",
      "middle",
    ]);
  });

  it("respects the limit", () => {
    expect(q.getRelated(q.getEntry("oldest")!, 1).map((e) => e.slug)).toEqual([
      "hausa",
    ]);
  });
});

describe("getAdjacent", () => {
  it("returns the older and newer neighbours by date", () => {
    expect(q.getAdjacent(q.getEntry("middle")!)).toMatchObject({
      older: { slug: "oldest" },
      newer: { slug: "newest" },
    });
    expect(q.getAdjacent(q.getEntry("oldest")!).older).toBeUndefined();
    expect(q.getAdjacent(q.getEntry("hausa")!).newer).toBeUndefined();
  });
});

describe("buildSearchIndex", () => {
  const { json, count } = buildSearchIndex(
    {
      entries: [
        entry("naira", {
          title: "Format naira amounts",
          plainText: "Intl NumberFormat kobo",
        }),
        entry("secret", { title: "Draft about naira", draft: true }),
      ],
      links: [link("vid", { title: "Hausa voice alerts", tags: ["expo"] })],
    },
    published,
  );
  const index = MiniSearch.loadJSON<SearchDocument>(json, searchIndexOptions);
  const search = (term: string) =>
    index.search(term, searchQueryOptions).map((r) => r.id);

  it("indexes only visible items", () => {
    expect(count).toBe(2);
    expect(search("naira")).toEqual(["entry:naira"]);
  });

  it("searches body text and tags, with prefix matching", () => {
    expect(search("kobo")).toEqual(["entry:naira"]);
    expect(search("exp")).toEqual(["link:vid"]);
  });

  it("stores only display fields", () => {
    const [hit] = index.search("naira", searchQueryOptions);
    expect(Object.keys(hit ?? {})).not.toContain("plainText");
    expect(hit).toMatchObject({
      url: "/naira",
      type: "essay",
      external: false,
    });
  });
});
