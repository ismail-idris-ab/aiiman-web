import type { Entry, Link, Page, Project } from "#velite";

export function entry(slug: string, overrides: Partial<Entry> = {}): Entry {
  return {
    title: `Title for ${slug}`,
    summary:
      "A summary that is long enough to satisfy the fifty character minimum.",
    date: "2026-01-01T00:00:00.000Z",
    type: "essay",
    tags: ["general"],
    lang: "en",
    noindex: false,
    draft: false,
    redirectFrom: [],
    toc: [],
    raw: "",
    body: "",
    kind: "entry",
    slug,
    url: `/${slug}`,
    source: `content/entries/${slug}.mdx`,
    readingTime: 1,
    wordCount: 100,
    plainText: "",
    ...overrides,
  };
}

export function link(slug: string, overrides: Partial<Link> = {}): Link {
  return {
    title: `Link ${slug}`,
    summary:
      "A summary that is long enough to satisfy the fifty character minimum.",
    date: "2026-01-01T00:00:00.000Z",
    type: "video",
    tags: ["general"],
    externalUrl: `https://example.com/${slug}`,
    lang: "en",
    draft: false,
    kind: "link",
    slug,
    url: `https://example.com/${slug}`,
    source: `content/links/${slug}.mdx`,
    plainText: "",
    ...overrides,
  };
}

export function project(
  slug: string,
  overrides: Partial<Project> = {},
): Project {
  return {
    name: slug,
    summary: "A project.",
    status: "building",
    featured: false,
    order: 1,
    draft: false,
    slug,
    ...overrides,
  };
}

export function page(slug: string, overrides: Partial<Page> = {}): Page {
  return {
    title: slug,
    summary:
      "A summary that is long enough to satisfy the fifty character minimum.",
    draft: false,
    toc: [],
    body: "",
    slug,
    ...overrides,
  };
}
