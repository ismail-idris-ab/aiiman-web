import { readFile } from "node:fs/promises";

import { normaliseDoc } from "@aiiman/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DocContent } from "@/components/post/doc-content";
import { highlightCodeBlocks } from "@/components/post/highlight-code";

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

  describe("images", () => {
    const image = (alt: string, name = "kano") => ({
      type: "image",
      attrs: {
        src: `https://abc123.public.blob.vercel-storage.com/images/${name}.webp`,
        alt,
        width: 1600,
        height: 900,
        blurDataURL: "data:image/webp;base64,UklGRkAAAABXRUJQ",
      },
    });
    const imgs = (html: string) => html.match(/<img [^>]*>/g) ?? [];

    it("renders next/image with dimensions, alt and blur placeholder", () => {
      const [img] = imgs(render(p(text("Intro")), image("Kano city walls")));
      expect(img).toContain('alt="Kano city walls"');
      expect(img).toContain('width="1600"');
      expect(img).toContain('height="900"');
      expect(img).toContain('sizes="(min-width: 768px) 43rem, 100vw"');
      expect(img).toContain("srcSet=");
      expect(img).toMatch(/background-image:url\(&quot;data:image\/svg\+xml/);
    });

    it("loads only an early first image eagerly", () => {
      const html = render(
        image("First", "a"),
        p(text("Words")),
        image("Second", "b"),
      );
      const [first, second] = imgs(html);
      expect(first).toContain('loading="eager"');
      expect(first).toContain('fetchPriority="high"');
      expect(second).toContain('loading="lazy"');
      expect(second).not.toContain("fetchPriority");
    });

    it("keeps images past the first blocks lazy", () => {
      const html = render(
        p(text("1")),
        p(text("2")),
        p(text("3")),
        image("Late"),
      );
      expect(imgs(html)[0]).toContain('loading="lazy"');
    });

    it("keeps every body image lazy when the page has a cover", () => {
      const html = renderToStaticMarkup(
        <DocContent
          doc={normaliseDoc({ type: "doc", content: [image("First")] })}
          lazyImages
        />,
      );
      expect(imgs(html)[0]).toContain('loading="lazy"');
      expect(html).not.toContain("fetchPriority");
    });

    it("renders nothing for an image from another host", () => {
      const foreign = image("Tracker");
      foreign.attrs.src = "https://example.com/images/x.webp";
      expect(render(foreign)).toBe("");
    });
  });

  describe("embeds", () => {
    const embed = (url: string, title?: string) => ({
      type: "embed",
      attrs: { url, ...(title === undefined ? {} : { title }) },
    });

    it("renders a load button and a link, with no iframe before a tap", () => {
      const html = render(
        embed("https://twitter.com/vercel/status/1790123456789012345?s=20"),
      );
      expect(html).not.toContain("<iframe");
      expect(html).toContain("Load X embed");
      expect(html).toContain("Post by @vercel on X");
      expect(html).toContain(
        'href="https://x.com/vercel/status/1790123456789012345" rel="noopener noreferrer"',
      );
      expect(html).toContain("Loads content from platform.twitter.com");
    });

    it("uses the writer's title", () => {
      const html = render(
        embed(
          "https://gist.github.com/octocat/6cad326836d38bd3a7ae",
          "Naira formatter",
        ),
      );
      expect(html).toContain("Naira formatter");
      expect(html).toContain("Open on GitHub Gist");
    });

    it("renders YouTube through the thumbnail facade", () => {
      const html = render(embed("https://youtu.be/dQw4w9WgXcQ", "A talk"));
      expect(html).toContain("Play video: A talk");
      expect(html).not.toContain("<iframe");
    });

    it("renders nothing for an unsupported link", () => {
      expect(render(embed("https://evil.example/watch?v=dQw4w9WgXcQ"))).toBe(
        "",
      );
    });
  });

  describe("code blocks", () => {
    const renderHighlighted = async (...content: unknown[]) => {
      const doc = normaliseDoc({ type: "doc", content });
      const code = await highlightCodeBlocks(doc);
      return renderToStaticMarkup(<DocContent doc={doc} code={code} />);
    };
    const block = (language: string, value: string) => ({
      type: "codeBlock",
      attrs: { language },
      content: [text(value)],
    });

    it("highlights with both high-contrast themes, like MDX", async () => {
      const html = await renderHighlighted(
        block("typescript", "const naira: number = 100;"),
      );
      expect(html).toContain("<figure data-rehype-pretty-code-figure");
      expect(html).toMatch(
        /<pre[^>]*data-language="typescript"[^>]*data-theme="github-light-high-contrast github-dark-high-contrast"/,
      );
      expect(html).toContain("--shiki-light:");
      expect(html).toContain("--shiki-dark:");
      expect(html).toContain("data-line");
    });

    it("wraps the block with the copy button", async () => {
      const html = await renderHighlighted(block("bash", "pnpm dev"));
      expect(html).toMatch(
        /<div class="group relative"><pre[\s\S]*<\/pre><button/,
      );
      expect(html).toContain("Copy");
    });

    it("renders unknown languages as plain text", async () => {
      const html = await renderHighlighted(block("klingon", "Qapla'"));
      expect(html).toContain('data-language="plaintext"');
      expect(html).toContain("Qapla&#x27;");
    });

    it("keeps code text as text and finds blocks inside lists and callouts", async () => {
      const html = await renderHighlighted({
        type: "callout",
        attrs: {},
        content: [
          {
            type: "bulletList",
            content: [li(block("html", "<script>alert(1)</script>"))],
          },
        ],
      });
      expect(html).toContain("data-rehype-pretty-code-figure");
      expect(html).not.toContain("<script>");
    });

    it("falls back to an unhighlighted block when not highlighted", () => {
      expect(render(block("go", "package main"))).toBe(
        "<pre><code>package main</code></pre>",
      );
    });
  });
});
