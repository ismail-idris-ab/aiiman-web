import { describe, expect, it } from "vitest";
import {
  calendarDate,
  draftInputSchema,
  missingRequiredPages,
  postInputSchema,
  publicPostSchema,
  RESERVED_SLUGS,
  textToDoc,
} from "../src/index.js";

const BLUR = "data:image/webp;base64,UklGRkAAAABXRUJQ";
const cover = {
  src: "https://abc123.public.blob.vercel-storage.com/images/cover.webp",
  alt: "Kano city walls at dusk",
  width: 1600,
  height: 900,
  blurDataURL: BLUR,
};
const image = (alt: string) => ({
  type: "image",
  attrs: { ...cover, alt },
});

const valid = {
  title: "A post written in the admin",
  summary:
    "A summary long enough to pass the fifty character minimum for posts.",
  slug: "a-post-written-in-the-admin",
  body: textToDoc("First paragraph.\n\nSecond paragraph."),
  type: "essay",
  tags: ["web", "react-native"],
  lang: "en",
  noindex: false,
};

const errorsFor = (override: Record<string, unknown>) => {
  const result = postInputSchema.safeParse({ ...valid, ...override });
  return result.success
    ? {}
    : Object.fromEntries(
        result.error.issues.map((issue) => [
          issue.path.join("."),
          issue.message,
        ]),
      );
};

describe("postInputSchema", () => {
  it("accepts a valid post and trims title and summary", () => {
    const parsed = postInputSchema.parse({
      ...valid,
      title: `  ${valid.title} `,
    });
    expect(parsed.title).toBe(valid.title);
  });

  it("accepts every optional field", () => {
    expect(
      errorsFor({
        date: "2026-10-22",
        updated: "2026-10-23",
        featured: 12,
        canonical: "https://example.com/original",
        noindex: true,
        cover,
      }),
    ).toEqual({});
  });

  // Every rule carried over from the Velite schema, plus slug and tag uniqueness.
  it.each([
    ["title too short", { title: "Short" }, "title"],
    ["title too long", { title: "x".repeat(71) }, "title"],
    ["summary too short", { summary: "Too short." }, "summary"],
    ["summary too long", { summary: "x".repeat(161) }, "summary"],
    ["slug with capitals", { slug: "My-Post" }, "slug"],
    ["slug with spaces", { slug: "my post" }, "slug"],
    ["slug with a trailing hyphen", { slug: "my-post-" }, "slug"],
    ["reserved slug", { slug: "about" }, "slug"],
    ["generated route slug", { slug: "opengraph-image" }, "slug"],
    ["no tags", { tags: [] }, "tags"],
    ["six tags", { tags: ["a", "b", "c", "d", "e", "f"] }, "tags"],
    ["tag not kebab-case", { tags: ["React Native"] }, "tags.0"],
    ["repeated tag", { tags: ["web", "web"] }, "tags"],
    ["link type on a post", { type: "video" }, "type"],
    ["unknown type", { type: "poem" }, "type"],
    ["unknown language", { lang: "fr" }, "lang"],
    ["date not a calendar date", { date: "22/10/2026" }, "date"],
    ["impossible date", { date: "2026-02-30" }, "date"],
    [
      "updated before date",
      { date: "2026-10-22", updated: "2026-10-21" },
      "updated",
    ],
    ["updated without date", { updated: "2026-10-21" }, "updated"],
    ["featured zero", { featured: 0 }, "featured"],
    ["featured past 12", { featured: 13 }, "featured"],
    ["featured fraction", { featured: 1.5 }, "featured"],
    ["http canonical", { canonical: "http://example.com" }, "canonical"],
    ["javascript canonical", { canonical: "javascript:alert(1)" }, "canonical"],
    ["noindex missing", { noindex: undefined }, "noindex"],
    ["cover without alt", { cover: { ...cover, alt: " " } }, "cover.alt"],
    [
      "cover from another host",
      { cover: { ...cover, src: "https://example.com/images/a.webp" } },
      "cover.src",
    ],
    [
      "cover without a blur placeholder",
      { cover: { ...cover, blurDataURL: "javascript:alert(1)" } },
      "cover.blurDataURL",
    ],
    [
      "image without alt",
      { body: { type: "doc", content: [image("A map"), image("")] } },
      "body",
    ],
  ])("rejects %s", (_name, override, path) => {
    expect(Object.keys(errorsFor(override))).toEqual([path]);
  });

  it("names every image that needs alt text", () => {
    const errors = errorsFor({
      body: { type: "doc", content: [image(""), image("A map"), image(" ")] },
    });
    expect(errors.body).toMatch(/image 1, 3:/);
  });

  it("reserves every site route", () => {
    for (const slug of ["api", "writing", "tags", "rss.xml", "md"]) {
      expect(RESERVED_SLUGS).toContain(slug);
    }
  });
});

describe("draftInputSchema", () => {
  it("saves what a writer has mid-way through", () => {
    const draft = {
      ...valid,
      title: "",
      summary: "Half a",
      slug: "",
      tags: ["React Native", "web-"],
      canonical: "https://exam",
      body: { type: "doc", content: [image("")] },
      cover: { ...cover, alt: "" },
    };
    const parsed = draftInputSchema.safeParse(draft);
    expect(parsed.success).toBe(true);
    // The same draft can't go live.
    expect(postInputSchema.safeParse(draft).success).toBe(false);
  });

  it.each([
    [
      "an image from elsewhere",
      { cover: { ...cover, src: "https://example.com/x.png" } },
      "cover.src",
    ],
    ["a title past the limit", { title: "x".repeat(71) }, "title"],
    ["an unknown type", { type: "poem" }, "type"],
    ["a featured position that isn't a number", { featured: null }, "featured"],
    ["a malformed date", { date: "22/10/2026" }, "date"],
  ])("still refuses %s", (_name, override, path) => {
    const result = draftInputSchema.safeParse({ ...valid, ...override });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join("."))).toEqual([
      path,
    ]);
  });

  it("normalises the body like the publishing schema", () => {
    const parsed = draftInputSchema.parse({
      ...valid,
      body: { type: "doc", content: [{ type: "script", text: "x" }] },
    });
    expect(parsed.body).toEqual({ type: "doc", content: [] });
  });
});

describe("publicPostSchema", () => {
  it("accepts dates as JSON serialises them", () => {
    const date = new Date("2026-10-22T09:30:00Z").toISOString();
    expect(
      publicPostSchema.safeParse({
        ...valid,
        date: "2026-10-22",
        publishedAt: date,
        updatedAt: date,
        authorName: "Ismail Idris",
      }).success,
    ).toBe(true);
  });
});

describe("calendarDate", () => {
  it("reads the date in the given time zone", () => {
    const lateUtc = new Date("2026-10-21T23:30:00Z");
    expect(calendarDate(lateUtc, "UTC")).toBe("2026-10-21");
    expect(calendarDate(lateUtc, "Africa/Lagos")).toBe("2026-10-22");
  });
});

describe("missingRequiredPages", () => {
  it("defers to the MDX build while pages are not in the database", () => {
    expect(missingRequiredPages(null)).toEqual([]);
  });

  it("lists required pages that are not published", () => {
    expect(missingRequiredPages(["about"])).toEqual(["privacy"]);
    expect(missingRequiredPages(["about", "privacy", "uses"])).toEqual([]);
  });
});

describe("dependency-free entry points", () => {
  it.each(["vocab", "embed"])(
    "%s imports nothing, so the site's client bundle never pulls in Zod",
    async (name) => {
      const { readFile } = await import("node:fs/promises");
      const source = await readFile(
        new URL(`../src/${name}.ts`, import.meta.url),
        "utf8",
      );
      expect(source).not.toMatch(/^\s*import\s/m);
    },
  );
});
