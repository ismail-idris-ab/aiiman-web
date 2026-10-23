import { describe, expect, it } from "vitest";
import {
  countNodes,
  docHeadings,
  docToc,
  docToMarkdown,
  docToText,
  isAllowedHref,
  MAX_DEPTH,
  normaliseDoc,
  readingMinutes,
  textToDoc,
  wordCount,
  type Doc,
} from "../src/doc.js";
import { docSchema } from "../src/post.js";

const text = (value: string, marks?: unknown[]) => ({
  type: "text",
  text: value,
  ...(marks === undefined ? {} : { marks }),
});
const p = (...content: unknown[]) => ({ type: "paragraph", content });
const h = (level: number, value: string) => ({
  type: "heading",
  attrs: { level },
  content: [text(value)],
});
const li = (...content: unknown[]) => ({ type: "listItem", content });
const doc = (...content: unknown[]) => ({ type: "doc", content });

/** A body using every allowed node and mark. */
const full: Doc = normaliseDoc(
  doc(
    p(text("Intro with "), text("bold", [{ type: "bold" }]), text(".")),
    h(2, "Why build for Arewa"),
    p(
      text("Read "),
      text("the docs", [
        { type: "link", attrs: { href: "https://example.com" } },
      ]),
      text(" and "),
      text("npm i", [{ type: "code" }]),
      { type: "hardBreak" },
      text("next line", [{ type: "italic" }]),
    ),
    h(3, "Details"),
    { type: "bulletList", content: [li(p(text("One"))), li(p(text("Two")))] },
    {
      type: "orderedList",
      attrs: { start: 3 },
      content: [
        li(p(text("Three")), {
          type: "bulletList",
          content: [li(p(text("Nested")))],
        }),
      ],
    },
    { type: "blockquote", content: [p(text("A quote"))] },
    {
      type: "callout",
      attrs: { title: "Store kobo, not naira" },
      content: [p(text("Integers avoid rounding."))],
    },
    h(4, "Why build for Arewa"),
  ),
);

describe("normaliseDoc", () => {
  it("keeps every allowed node and mark as given", () => {
    expect(full.content.map((block) => block.type)).toEqual([
      "paragraph",
      "heading",
      "paragraph",
      "heading",
      "bulletList",
      "orderedList",
      "blockquote",
      "callout",
      "heading",
    ]);
    expect(normaliseDoc(full)).toEqual(full);
  });

  it("returns an empty doc for anything that isn't a doc", () => {
    for (const input of [null, "text", 42, [], { type: "paragraph" }, {}]) {
      expect(normaliseDoc(input)).toEqual({ type: "doc", content: [] });
    }
  });

  // Hostile input: a client can send any JSON, not only what Tiptap produces.
  it("drops unknown nodes, including raw HTML and scripts", () => {
    const result = normaliseDoc(
      doc(
        { type: "html", content: [text("<script>alert(1)</script>")] },
        { type: "rawHTML", html: "<img onerror=alert(1)>" },
        { type: "iframe", attrs: { src: "https://evil.example" } },
        p(text("kept")),
        p({ type: "image", attrs: { src: "x" } }, text("inline kept")),
      ),
    );
    expect(result).toEqual(doc(p(text("kept")), p(text("inline kept"))));
  });

  it("drops unknown marks and attributes", () => {
    const result = normaliseDoc(
      doc({
        type: "paragraph",
        attrs: { style: "color:red", onclick: "x", class: "evil" },
        content: [
          text("styled", [
            { type: "bold", attrs: { style: "x" } },
            { type: "textStyle", attrs: { color: "red" } },
            { type: "underline" },
            { type: "bold" },
          ]),
        ],
      }),
    );
    expect(result).toEqual(doc(p(text("styled", [{ type: "bold" }]))));
  });

  it.each([
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    " javascript:alert(1)",
    "java\u0000script:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox",
    "//evil.example/path",
    "https://",
    "ftp://example.com",
  ])("drops the link but keeps the text for %j", (href) => {
    const result = normaliseDoc(
      doc(p(text("click", [{ type: "link", attrs: { href } }]))),
    );
    expect(result).toEqual(doc(p(text("click"))));
  });

  it("keeps https, http, mailto and site-relative links", () => {
    for (const href of [
      "https://example.com/a?b=c#d",
      "http://example.com",
      "mailto:hello@example.com",
      "/writing",
      "/tags/web#top",
    ]) {
      expect(isAllowedHref(href)).toBe(true);
    }
  });

  it("turns h1 and other levels into paragraphs, keeping the text", () => {
    const result = normaliseDoc(
      doc(h(1, "Second title"), h(5, "Too deep"), h(2, "Fine")),
    );
    expect(result).toEqual(
      doc(p(text("Second title")), p(text("Too deep")), h(2, "Fine")),
    );
  });

  it("drops empty containers and list items outside lists", () => {
    const result = normaliseDoc(
      doc(
        { type: "bulletList", content: [] },
        { type: "blockquote", content: [{ type: "nope" }] },
        { type: "callout", attrs: { title: "Empty" }, content: [] },
        li(p(text("orphan"))),
        { type: "bulletList", content: [p(text("not an item"))] },
      ),
    );
    expect(result).toEqual(doc());
  });

  it("drops nesting deeper than the limit", () => {
    let node: unknown = p(text("deep"));
    for (let i = 0; i < MAX_DEPTH + 2; i += 1) {
      node = { type: "blockquote", content: [node] };
    }
    expect(normaliseDoc(doc(node))).toEqual(doc());
  });

  it("removes empty text and bad ordered-list starts", () => {
    const result = normaliseDoc(
      doc(p(text(""), { type: "text", text: 5 }), {
        type: "orderedList",
        attrs: { start: -4 },
        content: [li(p(text("x")))],
      }),
    );
    expect(result).toEqual(
      doc(
        { type: "paragraph" },
        {
          type: "orderedList",
          attrs: { start: 1 },
          content: [li(p(text("x")))],
        },
      ),
    );
  });
});

describe("docSchema", () => {
  it("normalises on parse", () => {
    expect(docSchema.parse(doc({ type: "script" }, p(text("ok"))))).toEqual(
      doc(p(text("ok"))),
    );
  });

  it("rejects bodies over the node limit", () => {
    const huge = doc(...Array.from({ length: 21_000 }, () => p(text("x"))));
    expect(docSchema.safeParse(huge).success).toBe(false);
    expect(countNodes(normaliseDoc(doc(p(text("a")))))).toBe(3);
  });
});

describe("derivations", () => {
  it("plain text has every block, a blank line apart", () => {
    expect(docToText(full)).toBe(
      [
        "Intro with bold.",
        "Why build for Arewa",
        "Read the docs and npm i\nnext line",
        "Details",
        "One",
        "Two",
        "Three",
        "Nested",
        "A quote",
        "Store kobo, not naira",
        "Integers avoid rounding.",
        "Why build for Arewa",
      ].join("\n\n"),
    );
  });

  it("counts words and reading time like Velite", () => {
    expect(wordCount(textToDoc("one two\n\nthree"))).toBe(3);
    expect(readingMinutes(textToDoc("word"))).toBe(1);
    expect(readingMinutes(textToDoc("word ".repeat(1325)))).toBe(5);
  });

  it("headings get rehype-slug ids, unique per post", () => {
    expect(docHeadings(full)).toEqual([
      { level: 2, text: "Why build for Arewa", id: "why-build-for-arewa" },
      { level: 3, text: "Details", id: "details" },
      { level: 4, text: "Why build for Arewa", id: "why-build-for-arewa-1" },
    ]);
    expect(
      docHeadings(normaliseDoc(doc(h(2, "Ɗan Kano: Ƙasa & ɓarna!")))).at(0)?.id,
    ).toBe("ɗan-kano-ƙasa--ɓarna");
  });

  it("nests the table of contents by level", () => {
    expect(docToc(full)).toEqual([
      {
        title: "Why build for Arewa",
        url: "#why-build-for-arewa",
        items: [
          {
            title: "Details",
            url: "#details",
            items: [
              {
                title: "Why build for Arewa",
                url: "#why-build-for-arewa-1",
                items: [],
              },
            ],
          },
        ],
      },
    ]);
    expect(docToc(normaliseDoc(doc(h(3, "A"), h(2, "B"))))).toEqual([
      { title: "A", url: "#a", items: [] },
      { title: "B", url: "#b", items: [] },
    ]);
  });

  it("exports CommonMark", () => {
    expect(docToMarkdown(full)).toBe(
      [
        "Intro with **bold**.",
        "## Why build for Arewa",
        "Read [the docs](<https://example.com>) and `npm i`\\\n*next line*",
        "### Details",
        "- One\n- Two",
        "3. Three\n\n   - Nested",
        "> A quote",
        "> **Store kobo, not naira**\n>\n> Integers avoid rounding.",
        "#### Why build for Arewa",
      ].join("\n\n"),
    );
  });

  it("escapes Markdown syntax typed as text", () => {
    const md = docToMarkdown(
      normaliseDoc(
        doc(
          p(text("# not a heading")),
          p(text("- not a list")),
          p(text("1. not a list")),
          p(text("> not a quote")),
          p(text("*stars* and [brackets](x) <b>")),
          p(text("a `tick`", [{ type: "code" }])),
        ),
      ),
    );
    expect(md).toBe(
      [
        "\\# not a heading",
        "\\- not a list",
        "\\1. not a list",
        "\\> not a quote",
        "\\*stars\\* and \\[brackets\\](x) \\<b\\>",
        // A span ending in a backtick needs padding inside a longer fence.
        "`` a `tick` ``",
      ].join("\n\n"),
    );
  });
});
