import { readFile } from "node:fs/promises";

import { normaliseDoc } from "@aiiman/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DocContent } from "@/components/post/doc-content";

const text = (value: string, marks?: unknown[]) => ({
  type: "text",
  text: value,
  ...(marks === undefined ? {} : { marks }),
});
const p = (...content: unknown[]) => ({ type: "paragraph", content });
const li = (...content: unknown[]) => ({ type: "listItem", content });

const render = (...content: unknown[]) =>
  renderToStaticMarkup(
    <DocContent doc={normaliseDoc({ type: "doc", content })} />,
  );

describe("DocContent", () => {
  it("renders headings h2–h4 with rehype-slug ids and wrapped anchors", () => {
    const html = render(
      { type: "heading", attrs: { level: 2 }, content: [text("Why Arewa")] },
      { type: "heading", attrs: { level: 3 }, content: [text("Details")] },
      { type: "heading", attrs: { level: 4 }, content: [text("Why Arewa")] },
    );
    expect(html).toBe(
      '<h2 id="why-arewa"><a class="heading-anchor" href="#why-arewa">Why Arewa</a></h2>' +
        '<h3 id="details"><a class="heading-anchor" href="#details">Details</a></h3>' +
        '<h4 id="why-arewa-1"><a class="heading-anchor" href="#why-arewa-1">Why Arewa</a></h4>',
    );
  });

  it("never renders an h1, even from hostile input", () => {
    const html = render({
      type: "heading",
      attrs: { level: 1 },
      content: [text("Second title")],
    });
    expect(html).toBe("<p>Second title</p>");
  });

  it("renders marks with semantic elements", () => {
    const html = render(
      p(
        text("b", [{ type: "bold" }]),
        text("i", [{ type: "italic" }]),
        text("c", [{ type: "code" }]),
        { type: "hardBreak" },
        text("both", [{ type: "bold" }, { type: "italic" }]),
      ),
    );
    expect(html).toBe(
      "<p><strong>b</strong><em>i</em><code>c</code><br/><strong><em>both</em></strong></p>",
    );
  });

  it("renders external links like MDX does and internal ones as site links", () => {
    const html = render(
      p(
        text("out", [{ type: "link", attrs: { href: "https://example.com" } }]),
        text("in", [{ type: "link", attrs: { href: "/writing" } }]),
        text("bad", [{ type: "link", attrs: { href: "javascript:alert(1)" } }]),
      ),
    );
    expect(html).toContain(
      '<a href="https://example.com" rel="noopener noreferrer">out',
    );
    expect(html).toContain('<a href="/writing">in</a>');
    expect(html).toContain("bad");
    expect(html).not.toContain("javascript:");
  });

  it("escapes text instead of rendering it as HTML", () => {
    const html = render(p(text('<img src=x onerror="alert(1)">')));
    expect(html).toBe("<p>&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</p>");
  });

  it("renders lists tight, quotes and callouts", () => {
    const html = render(
      { type: "bulletList", content: [li(p(text("One"))), li(p(text("Two")))] },
      {
        type: "orderedList",
        attrs: { start: 3 },
        content: [li(p(text("Three")), p(text("More")))],
      },
      { type: "blockquote", content: [p(text("Quoted"))] },
      {
        type: "callout",
        attrs: { title: "Store kobo" },
        content: [p(text("Integers."))],
      },
    );
    expect(html).toContain("<ul><li>One</li><li>Two</li></ul>");
    expect(html).toContain(
      '<ol start="3"><li><p>Three</p><p>More</p></li></ol>',
    );
    expect(html).toContain("<blockquote><p>Quoted</p></blockquote>");
    expect(html).toMatch(
      /<aside[^>]*role="note"[^>]*>.*Store kobo.*Integers\./,
    );
  });

  it("does not link a link inside a heading anchor", () => {
    const html = render({
      type: "heading",
      attrs: { level: 2 },
      content: [
        text("See docs", [
          { type: "link", attrs: { href: "https://example.com" } },
        ]),
      ],
    });
    expect(html.match(/<a /g)).toHaveLength(1);
  });

  it("has no dangerouslySetInnerHTML", async () => {
    const source = await readFile(
      new URL("../../src/components/post/doc-content.tsx", import.meta.url),
      "utf8",
    );
    expect(source).not.toContain("dangerouslySetInnerHTML");
  });
});
