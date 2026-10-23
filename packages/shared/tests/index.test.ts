import { describe, expect, it } from "vitest";
import {
  docSchema,
  docToText,
  postInputSchema,
  publicPostSchema,
  RESERVED_SLUGS,
  textToDoc,
} from "../src/index.js";

const valid = {
  title: "A post written in the admin",
  summary:
    "A summary long enough to pass the fifty character minimum for posts.",
  slug: "a-post-written-in-the-admin",
  body: textToDoc("First paragraph.\n\nSecond paragraph."),
};

describe("textToDoc / docToText", () => {
  it("splits on blank lines and collapses other whitespace", () => {
    const doc = textToDoc("  One\nline  \n\n\n Two \r\n\r\nThree\n");
    expect(doc.content.map((p) => p.content?.[0]?.text)).toEqual([
      "One line",
      "Two",
      "Three",
    ]);
  });

  it("round-trips paragraphs", () => {
    expect(docToText(textToDoc("One\n\nTwo"))).toBe("One\n\nTwo");
  });

  it("returns an empty doc for blank text", () => {
    expect(textToDoc(" \n\n ").content).toEqual([]);
  });
});

describe("docSchema", () => {
  it("accepts empty paragraphs as Tiptap emits them", () => {
    expect(
      docSchema.safeParse({ type: "doc", content: [{ type: "paragraph" }] })
        .success,
    ).toBe(true);
  });

  it("rejects node types outside the allowlist", () => {
    const doc = {
      type: "doc",
      content: [{ type: "html", content: [{ type: "text", text: "<b>" }] }],
    };
    expect(docSchema.safeParse(doc).success).toBe(false);
  });

  it("strips unknown keys", () => {
    const parsed = docSchema.parse({
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { onclick: "x" },
          content: [{ type: "text", text: "Hi" }],
        },
      ],
    });
    expect(parsed.content[0]).toEqual({
      type: "paragraph",
      content: [{ type: "text", text: "Hi" }],
    });
  });
});

describe("postInputSchema", () => {
  it("accepts a valid post and trims title and summary", () => {
    const parsed = postInputSchema.parse({
      ...valid,
      title: `  ${valid.title} `,
    });
    expect(parsed.title).toBe(valid.title);
  });

  it.each([
    ["title too short", { title: "Short" }],
    ["title too long", { title: "x".repeat(71) }],
    ["summary too short", { summary: "Too short." }],
    ["summary too long", { summary: "x".repeat(161) }],
    ["slug with capitals", { slug: "My-Post" }],
    ["slug with spaces", { slug: "my post" }],
    ["reserved slug", { slug: "about" }],
    ["generated route slug", { slug: "opengraph-image" }],
  ])("rejects %s", (_name, override) => {
    expect(postInputSchema.safeParse({ ...valid, ...override }).success).toBe(
      false,
    );
  });

  it("reserves every site route", () => {
    for (const slug of ["api", "writing", "tags", "rss.xml", "md"]) {
      expect(RESERVED_SLUGS).toContain(slug);
    }
  });
});

describe("publicPostSchema", () => {
  it("accepts dates as JSON serialises them", () => {
    const date = new Date("2026-10-22T09:30:00Z").toISOString();
    expect(
      publicPostSchema.safeParse({
        slug: valid.slug,
        title: valid.title,
        summary: valid.summary,
        publishedAt: date,
        updatedAt: date,
        authorName: "Ismail Idris",
        body: valid.body,
      }).success,
    ).toBe(true);
  });
});
