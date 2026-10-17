import { describe, expect, it } from "vitest";

import {
  findBodyIssues,
  findCollectionIssues,
  stripMdxComments,
  type MdNode,
  type RuleEntry,
} from "@/lib/content/rules";

const root = (...children: MdNode[]): MdNode => ({ type: "root", children });
const ruleEntry = (
  slug: string,
  overrides: Partial<RuleEntry> = {},
): RuleEntry => ({
  slug,
  source: `content/entries/${slug}.mdx`,
  lang: "en",
  redirectFrom: [],
  ...overrides,
});

describe("findBodyIssues", () => {
  it("passes a body that starts at h2 with alt text on images", () => {
    expect(
      findBodyIssues(
        root(
          { type: "heading", depth: 2, children: [] },
          {
            type: "paragraph",
            children: [{ type: "image", url: "./a.png", alt: "A chart" }],
          },
        ),
      ),
    ).toEqual([]);
  });

  it("flags an h1", () => {
    expect(
      findBodyIssues(root({ type: "heading", depth: 1, children: [] })),
    ).toEqual([expect.stringContaining("h1")]);
  });

  it("ignores '# ' inside code blocks (they are code nodes, not headings)", () => {
    expect(findBodyIssues(root({ type: "code" }))).toEqual([]);
  });

  it("flags markdown images with empty or whitespace alt", () => {
    const issues = findBodyIssues(
      root(
        { type: "image", url: "./a.png", alt: "" },
        { type: "image", url: "./b.png", alt: "  " },
      ),
    );
    expect(issues).toHaveLength(2);
    expect(issues[0]).toContain("./a.png");
  });

  it("flags JSX <Image> and <img> without a string alt", () => {
    const issues = findBodyIssues(
      root(
        { type: "mdxJsxFlowElement", name: "Image", attributes: [] },
        {
          type: "mdxJsxTextElement",
          name: "img",
          attributes: [{ type: "mdxJsxAttribute", name: "alt", value: "Fine" }],
        },
      ),
    );
    expect(issues).toEqual([expect.stringContaining("<Image>")]);
  });
});

describe("stripMdxComments", () => {
  it("removes single and multi-line MDX comments and collapses blank lines", () => {
    const input =
      "{/* REVIEW: a */}\nIntro.\n\n{/* REVIEW:\n multi */}\n\n\nEnd.";
    expect(stripMdxComments(input)).toBe("Intro.\n\nEnd.");
  });

  it("leaves ordinary braces alone", () => {
    expect(stripMdxComments("const a = { b: 1 };")).toBe("const a = { b: 1 };");
  });
});

describe("findCollectionIssues", () => {
  it("accepts a valid set", () => {
    expect(
      findCollectionIssues(
        [
          ruleEntry("one", { featured: 1 }),
          ruleEntry("dau", { lang: "ha", translationOf: "one" }),
        ],
        [{ slug: "video", source: "content/links/video.mdx", featured: 2 }],
      ),
    ).toEqual([]);
  });

  it("flags duplicate slugs across entries and links, naming both files", () => {
    const [issue] = findCollectionIssues(
      [ruleEntry("same")],
      [{ slug: "same", source: "content/links/same.mdx" }],
    );
    expect(issue).toContain("content/entries/same.mdx");
    expect(issue).toContain("content/links/same.mdx");
  });

  it.each(["about", "rss.xml", "md", "_next"])(
    "flags reserved slug %s",
    (slug) => {
      expect(findCollectionIssues([ruleEntry(slug)], []).join()).toContain(
        "reserved route",
      );
    },
  );

  it("flags non-kebab slugs", () => {
    expect(findCollectionIssues([ruleEntry("Bad_Slug")], []).join()).toContain(
      "kebab-case",
    );
  });

  it("flags repeated featured positions", () => {
    expect(
      findCollectionIssues(
        [ruleEntry("a", { featured: 1 })],
        [{ slug: "b", source: "content/links/b.mdx", featured: 1 }],
      ).join(),
    ).toContain("featured: 1");
  });

  it("flags translationOf pointing at a missing slug", () => {
    expect(
      findCollectionIssues(
        [ruleEntry("ha", { lang: "ha", translationOf: "ghost" })],
        [],
      ).join(),
    ).toContain('"ghost" does not match');
  });

  it("flags translationOf with the same lang", () => {
    expect(
      findCollectionIssues(
        [
          ruleEntry("a", { lang: "ha" }),
          ruleEntry("b", { lang: "ha", translationOf: "a" }),
        ],
        [],
      ).join(),
    ).toContain("same lang");
  });

  it("flags translationOf on the English entry", () => {
    expect(
      findCollectionIssues(
        [
          ruleEntry("a", { lang: "ha" }),
          ruleEntry("b", { translationOf: "a" }),
        ],
        [],
      ).join(),
    ).toContain("only the Hausa version");
  });

  it("flags two translations of one original", () => {
    expect(
      findCollectionIssues(
        [
          ruleEntry("en"),
          ruleEntry("ha1", { lang: "ha", translationOf: "en" }),
          ruleEntry("ha2", { lang: "ha", translationOf: "en" }),
        ],
        [],
      ).join(),
    ).toContain("already has a translation");
  });

  it("flags redirectFrom that shadows a live slug or reserved route", () => {
    const issues = findCollectionIssues(
      [ruleEntry("a", { redirectFrom: ["b", "about"] }), ruleEntry("b")],
      [],
    );
    expect(issues).toHaveLength(2);
  });

  it("flags one old slug claimed by two entries", () => {
    expect(
      findCollectionIssues(
        [
          ruleEntry("a", { redirectFrom: ["old"] }),
          ruleEntry("b", { redirectFrom: ["old"] }),
        ],
        [],
      ).join(),
    ).toContain("already claimed");
  });
});
