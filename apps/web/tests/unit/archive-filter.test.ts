import { describe, expect, it } from "vitest";

import {
  EMPTY_FILTERS,
  isFiltered,
  matchesFilters,
  parseFilters,
  toQueryString,
  type ArchiveItemMeta,
} from "@/lib/archive-filter";

const params = (query: string) => new URLSearchParams(query);
const item: ArchiveItemMeta = {
  id: "entry:a",
  type: "note",
  tags: ["react", "web"],
  lang: "ha",
  text: "state in react a short note react web",
};

describe("parseFilters", () => {
  it("reads valid values", () => {
    expect(
      parseFilters(params("type=note&tag=React&lang=ha&q=%20state%20")),
    ).toEqual({
      type: "note",
      tag: "react",
      lang: "ha",
      q: "state",
    });
  });

  it("ignores unknown types and langs", () => {
    expect(parseFilters(params("type=bogus&lang=xx"))).toEqual(EMPTY_FILTERS);
  });

  it("caps the text query", () => {
    expect(parseFilters(params(`q=${"a".repeat(500)}`)).q).toHaveLength(100);
  });
});

describe("toQueryString", () => {
  it("uses a stable key order and drops empty values", () => {
    expect(
      toQueryString({ q: "x y", lang: "en", tag: "web", type: "essay" }),
    ).toBe("?type=essay&tag=web&lang=en&q=x+y");
    expect(toQueryString(EMPTY_FILTERS)).toBe("");
    expect(isFiltered(EMPTY_FILTERS)).toBe(false);
  });

  it("round-trips through parseFilters", () => {
    const filters = {
      type: "video",
      tag: "expo",
      lang: "en",
      q: "hausa voice",
    } as const;
    expect(parseFilters(params(toQueryString(filters).slice(1)))).toEqual(
      filters,
    );
  });
});

describe("matchesFilters", () => {
  it("matches when every set filter matches", () => {
    expect(
      matchesFilters(item, {
        type: "note",
        tag: "web",
        lang: "ha",
        q: "react state",
      }),
    ).toBe(true);
  });

  it.each([
    [{ type: "essay" as const }],
    [{ tag: "css" }],
    [{ lang: "en" as const }],
    [{ q: "vue" }],
  ])("rejects a mismatch on %j", (patch) => {
    expect(matchesFilters(item, { ...EMPTY_FILTERS, ...patch })).toBe(false);
  });

  it("requires every word of the text query", () => {
    expect(matchesFilters(item, { ...EMPTY_FILTERS, q: "react vue" })).toBe(
      false,
    );
  });
});
