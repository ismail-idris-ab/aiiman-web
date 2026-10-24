/**
 * The post body: Tiptap JSON through an allowlist. `normaliseDoc` turns any
 * input into a valid Doc by dropping what isn't allowed, and the derivations
 * (plain text, headings, reading time, images, Markdown) all read the
 * normalised form.
 */

import GithubSlugger from "github-slugger";

import { embedLabel, embedUrl, resolveEmbed } from "./embed.js";
import { isBlobImageUrl, isCodeLanguage, type CodeLanguage } from "./vocab.js";

export type Mark =
  | { type: "bold" }
  | { type: "italic" }
  | { type: "code" }
  | { type: "link"; attrs: { href: string } };

export interface TextNode {
  type: "text";
  text: string;
  marks?: Mark[];
}

export interface HardBreak {
  type: "hardBreak";
}

export type Inline = TextNode | HardBreak;

export type HeadingLevel = 2 | 3 | 4;

export interface Paragraph {
  type: "paragraph";
  content?: Inline[];
}

export interface Heading {
  type: "heading";
  attrs: { level: HeadingLevel };
  content?: Inline[];
}

export interface ListItem {
  type: "listItem";
  content: Block[];
}

export interface BulletList {
  type: "bulletList";
  content: ListItem[];
}

export interface OrderedList {
  type: "orderedList";
  attrs: { start: number };
  content: ListItem[];
}

export interface Blockquote {
  type: "blockquote";
  content: Block[];
}

export interface Callout {
  type: "callout";
  attrs: { title?: string };
  content: Block[];
}

/** Code as plain text (no marks); line breaks are "\n" inside the text. */
export interface CodeBlock {
  type: "codeBlock";
  attrs: { language: CodeLanguage };
  content?: [{ type: "text"; text: string }];
}

/**
 * An uploaded image. Width, height and the blur placeholder come from the
 * upload, so the site reserves its space before it loads. Alt may be empty
 * here; the post schema refuses to save it that way.
 */
export interface ImageAttrs {
  src: string;
  alt: string;
  width: number;
  height: number;
  blurDataURL: string;
}

export interface Image {
  type: "image";
  attrs: ImageAttrs;
}

/** A third-party post or video, stored as its canonical URL (see `resolveEmbed`). */
export interface EmbedNode {
  type: "embed";
  attrs: { url: string; title?: string };
}

export type Block =
  | Paragraph
  | Heading
  | BulletList
  | OrderedList
  | Blockquote
  | Callout
  | CodeBlock
  | Image
  | EmbedNode;

export interface Doc {
  type: "doc";
  content: Block[];
}

export const EMPTY_DOC: Doc = { type: "doc", content: [] };

/** Nesting deeper than this (lists in quotes in callouts…) is dropped. */
export const MAX_DEPTH = 8;
const MAX_TEXT_LENGTH = 20_000;
const MAX_CODE_LENGTH = 100_000;
const MAX_TITLE_LENGTH = 120;
export const MAX_ALT_LENGTH = 1000;
const MAX_DIMENSION = 10_000;
const MAX_BLUR_LENGTH = 4096;
/** Upper bound on nodes in one body; the schema rejects anything larger. */
export const MAX_NODES = 20_000;

const LINK_PROTOCOLS = /^(https?:\/\/|mailto:)/i;

/**
 * Links may go to http(s), mailto, or a path on this site ("/writing").
 * Everything else, `javascript:` and `data:` included, loses its link.
 */
export function isAllowedHref(href: string): boolean {
  if (href.length > 2048 || /\s/.test(href)) return false;
  // Control characters let some browsers read "java\0script:" as a scheme.
  if ([...href].some((char) => char.charCodeAt(0) < 32)) return false;
  if (href.startsWith("/")) return !href.startsWith("//");
  if (!LINK_PROTOCOLS.test(href)) return false;
  try {
    const url = new URL(href);
    return url.protocol === "mailto:" || url.hostname !== "";
  } catch {
    return false;
  }
}

/** The tiny base64 image an upload makes for `next/image`'s blur placeholder. */
export function isBlurDataUrl(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= MAX_BLUR_LENGTH &&
    /^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)
  );
}

const isDimension = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value > 0 &&
  value <= MAX_DIMENSION;

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const children = (node: Json): unknown[] =>
  Array.isArray(node.content) ? node.content : [];

function normaliseMarks(value: unknown): Mark[] {
  if (!Array.isArray(value)) return [];
  const marks: Mark[] = [];
  const seen = new Set<string>();
  for (const mark of value) {
    if (!isObject(mark) || typeof mark.type !== "string") continue;
    if (seen.has(mark.type)) continue;
    if (
      mark.type === "bold" ||
      mark.type === "italic" ||
      mark.type === "code"
    ) {
      marks.push({ type: mark.type });
      seen.add(mark.type);
    } else if (mark.type === "link") {
      const href = isObject(mark.attrs) ? mark.attrs.href : undefined;
      if (typeof href === "string" && isAllowedHref(href.trim())) {
        marks.push({ type: "link", attrs: { href: href.trim() } });
        seen.add("link");
      }
    }
  }
  return marks;
}

function normaliseInline(value: unknown): Inline[] {
  const inline: Inline[] = [];
  for (const node of Array.isArray(value) ? value : []) {
    if (!isObject(node)) continue;
    if (node.type === "hardBreak") {
      inline.push({ type: "hardBreak" });
    } else if (
      node.type === "text" &&
      typeof node.text === "string" &&
      node.text !== ""
    ) {
      const marks = normaliseMarks(node.marks);
      inline.push({
        type: "text",
        text: node.text.slice(0, MAX_TEXT_LENGTH),
        ...(marks.length === 0 ? {} : { marks }),
      });
    }
  }
  return inline;
}

// Tiptap omits `content` on an empty paragraph or heading; so do we.
const paragraph = (content: Inline[]): Paragraph =>
  content.length === 0 ? { type: "paragraph" } : { type: "paragraph", content };

const heading = (level: HeadingLevel, content: Inline[]): Heading =>
  content.length === 0
    ? { type: "heading", attrs: { level } }
    : { type: "heading", attrs: { level }, content };

function normaliseListItems(node: Json, depth: number): ListItem[] {
  const items: ListItem[] = [];
  for (const item of children(node)) {
    if (!isObject(item) || item.type !== "listItem") continue;
    const content = normaliseBlocks(children(item), depth + 1);
    if (content.length > 0) items.push({ type: "listItem", content });
  }
  return items;
}

function normaliseBlock(node: unknown, depth: number): Block | null {
  if (!isObject(node) || depth > MAX_DEPTH) return null;
  const attrs = isObject(node.attrs) ? node.attrs : {};
  switch (node.type) {
    case "paragraph":
      return paragraph(normaliseInline(node.content));
    case "heading": {
      const content = normaliseInline(node.content);
      const level = attrs.level;
      // The post title is the page's only h1; anything outside h2–h4 keeps its text as a paragraph.
      if (level === 2 || level === 3 || level === 4) {
        return heading(level, content);
      }
      return paragraph(content);
    }
    case "bulletList": {
      const content = normaliseListItems(node, depth);
      return content.length === 0 ? null : { type: "bulletList", content };
    }
    case "orderedList": {
      const content = normaliseListItems(node, depth);
      const start =
        typeof attrs.start === "number" &&
        Number.isInteger(attrs.start) &&
        attrs.start >= 0 &&
        attrs.start < 1_000_000
          ? attrs.start
          : 1;
      return content.length === 0
        ? null
        : { type: "orderedList", attrs: { start }, content };
    }
    case "blockquote": {
      const content = normaliseBlocks(children(node), depth + 1);
      return content.length === 0 ? null : { type: "blockquote", content };
    }
    case "callout": {
      const content = normaliseBlocks(children(node), depth + 1);
      const title =
        typeof attrs.title === "string"
          ? attrs.title.trim().slice(0, MAX_TITLE_LENGTH)
          : "";
      return content.length === 0
        ? null
        : {
            type: "callout",
            attrs: title === "" ? {} : { title },
            content,
          };
    }
    case "codeBlock": {
      // Marks and other inline nodes don't belong in code: keep their text only.
      const code = children(node)
        .map((child) =>
          isObject(child) && typeof child.text === "string" ? child.text : "",
        )
        .join("")
        .slice(0, MAX_CODE_LENGTH);
      const language = isCodeLanguage(attrs.language)
        ? attrs.language
        : "plaintext";
      return code === ""
        ? { type: "codeBlock", attrs: { language } }
        : {
            type: "codeBlock",
            attrs: { language },
            content: [{ type: "text", text: code }],
          };
    }
    case "image": {
      // Only images uploaded here, with the measurements the upload recorded.
      const { src, alt, width, height, blurDataURL } = attrs;
      if (
        !isBlobImageUrl(src) ||
        !isDimension(width) ||
        !isDimension(height) ||
        !isBlurDataUrl(blurDataURL)
      ) {
        return null;
      }
      return {
        type: "image",
        attrs: {
          src,
          alt:
            typeof alt === "string" ? alt.trim().slice(0, MAX_ALT_LENGTH) : "",
          width,
          height,
          blurDataURL,
        },
      };
    }
    case "embed": {
      // Unsupported or malformed links are dropped; the admin says why before inserting.
      const resolved =
        typeof attrs.url === "string" ? resolveEmbed(attrs.url) : null;
      if (resolved === null || !resolved.ok) return null;
      const title =
        typeof attrs.title === "string"
          ? attrs.title.trim().slice(0, MAX_TITLE_LENGTH)
          : "";
      return {
        type: "embed",
        attrs: {
          url: embedUrl(resolved.embed),
          ...(title === "" ? {} : { title }),
        },
      };
    }
    default:
      return null;
  }
}

function normaliseBlocks(value: unknown[], depth: number): Block[] {
  const blocks: Block[] = [];
  for (const node of value) {
    const block = normaliseBlock(node, depth);
    if (block !== null) blocks.push(block);
  }
  return blocks;
}

/** Any input → a Doc of allowed nodes, marks and attributes only. Never throws. */
export function normaliseDoc(input: unknown): Doc {
  if (!isObject(input) || input.type !== "doc") return EMPTY_DOC;
  return { type: "doc", content: normaliseBlocks(children(input), 1) };
}

/** Number of nodes, marks excluded; the schema caps it at MAX_NODES. */
export function countNodes(doc: Doc): number {
  let count = 0;
  const visit = (node: { content?: readonly unknown[] }) => {
    count += 1;
    for (const child of node.content ?? []) visit(child as typeof node);
  };
  visit(doc);
  return count;
}

const inlineText = (content: readonly Inline[] | undefined): string =>
  (content ?? [])
    .map((node) => (node.type === "text" ? node.text : "\n"))
    .join("");

function blockText(block: Block): string[] {
  switch (block.type) {
    case "paragraph":
    case "heading":
      return [inlineText(block.content)];
    case "bulletList":
    case "orderedList":
      return block.content.flatMap((item) => item.content.flatMap(blockText));
    case "blockquote":
      return block.content.flatMap(blockText);
    case "callout":
      return [
        ...(block.attrs.title === undefined ? [] : [block.attrs.title]),
        ...block.content.flatMap(blockText),
      ];
    case "codeBlock":
      return [block.content?.[0].text ?? ""];
    case "image":
    case "embed":
      return [];
  }
}

/** Every block's text, separated by blank lines: for search, feeds and meta. */
export function docToText(doc: Doc): string {
  return doc.content
    .flatMap(blockText)
    .map((text) => text.trim())
    .filter((text) => text !== "")
    .join("\n\n");
}

export function wordCount(doc: Doc): number {
  return docToText(doc)
    .split(/\s+/)
    .filter((word) => word !== "").length;
}

// Velite's default, so admin posts and MDX Entries agree on reading times.
const WORDS_PER_MINUTE = 265;

export const readingMinutes = (doc: Doc): number =>
  Math.max(1, Math.round(wordCount(doc) / WORDS_PER_MINUTE));

/** Images in document order, the ones inside lists, quotes and callouts included. */
export function docImages(doc: Doc): ImageAttrs[] {
  const images: ImageAttrs[] = [];
  const visit = (blocks: readonly Block[]) => {
    for (const block of blocks) {
      if (block.type === "image") {
        images.push(block.attrs);
      } else if (block.type === "bulletList" || block.type === "orderedList") {
        for (const item of block.content) visit(item.content);
      } else if (block.type === "blockquote" || block.type === "callout") {
        visit(block.content);
      }
    }
  };
  visit(doc.content);
  return images;
}

export interface DocHeading {
  level: HeadingLevel;
  text: string;
  /** Anchor id, made the way rehype-slug makes them for MDX (github-slugger). */
  id: string;
}

/** Headings in document order, the ones inside lists, quotes and callouts included. */
export function docHeadings(doc: Doc): DocHeading[] {
  const slugger = new GithubSlugger();
  const headings: DocHeading[] = [];
  const visit = (blocks: readonly Block[]) => {
    for (const block of blocks) {
      if (block.type === "heading") {
        const text = inlineText(block.content).replace(/\n/g, " ").trim();
        headings.push({
          level: block.attrs.level,
          text,
          id: slugger.slug(text),
        });
      } else if (block.type === "bulletList" || block.type === "orderedList") {
        for (const item of block.content) visit(item.content);
      } else if (block.type === "blockquote" || block.type === "callout") {
        visit(block.content);
      }
    }
  };
  visit(doc.content);
  return headings;
}

export interface TocEntry {
  title: string;
  url: string;
  items: TocEntry[];
}

/** Headings as a nested table of contents, the shape Velite's `s.toc()` produces. */
export function docToc(doc: Doc): TocEntry[] {
  const root: TocEntry[] = [];
  const stack: Array<{ level: number; items: TocEntry[] }> = [
    { level: 1, items: root },
  ];
  for (const heading of docHeadings(doc)) {
    const entry: TocEntry = {
      title: heading.text,
      url: `#${heading.id}`,
      items: [],
    };
    while ((stack.at(-1)?.level ?? 1) >= heading.level) stack.pop();
    (stack.at(-1) ?? stack[0])?.items.push(entry);
    stack.push({ level: heading.level, items: entry.items });
  }
  return root;
}

/** Characters that would start Markdown syntax inside running text. */
const escapeMarkdown = (text: string) =>
  text.replace(/([\\`*_[\]<>#|~])/g, "\\$1");

/** A line that would otherwise read as a list item, heading or quote. */
const escapeLineStart = (line: string) =>
  line
    .replace(/^(\s*)([-+]|\d+[.)])(\s)/, "$1\\$2$3")
    .replace(/^(\s*)>/, "$1\\>");

function codeSpan(text: string): string {
  const longest = Math.max(
    0,
    ...(text.match(/`+/g) ?? []).map((r) => r.length),
  );
  const fence = "`".repeat(longest + 1);
  const pad = text.startsWith("`") || text.endsWith("`") ? " " : "";
  return `${fence}${pad}${text}${pad}${fence}`;
}

function inlineMarkdown(content: readonly Inline[] | undefined): string {
  return (content ?? [])
    .map((node) => {
      if (node.type === "hardBreak") return "\\\n";
      const marks = node.marks ?? [];
      const has = (type: Mark["type"]) => marks.some((m) => m.type === type);
      let out = has("code") ? codeSpan(node.text) : escapeMarkdown(node.text);
      if (has("italic")) out = `*${out}*`;
      if (has("bold")) out = `**${out}**`;
      const link = marks.find((m) => m.type === "link");
      if (link?.type === "link") {
        out = `[${out}](<${link.attrs.href.replace(/[<>]/g, encodeURIComponent)}>)`;
      }
      return out;
    })
    .join("");
}

const indent = (text: string, prefix: string, first = prefix) =>
  text
    .split("\n")
    .map((line, i) => (line === "" ? line : (i === 0 ? first : prefix) + line))
    .join("\n");

function blockMarkdown(block: Block): string {
  switch (block.type) {
    case "paragraph":
      return escapeLineStart(inlineMarkdown(block.content));
    case "heading":
      return `${"#".repeat(block.attrs.level)} ${inlineMarkdown(block.content)}`;
    case "bulletList":
      return block.content
        .map((item) => indent(blocksMarkdown(item.content), "  ", "- "))
        .join("\n");
    case "orderedList":
      return block.content
        .map((item, i) => {
          const marker = `${block.attrs.start + i}. `;
          return indent(
            blocksMarkdown(item.content),
            " ".repeat(marker.length),
            marker,
          );
        })
        .join("\n");
    case "blockquote":
      return quote(blocksMarkdown(block.content));
    case "callout":
      return quote(
        [
          ...(block.attrs.title === undefined
            ? []
            : [`**${escapeMarkdown(block.attrs.title)}**`]),
          blocksMarkdown(block.content),
        ].join("\n\n"),
      );
    case "codeBlock": {
      const code = block.content?.[0].text ?? "";
      // The fence must be longer than any backtick run inside the code.
      const longest = Math.max(
        2,
        ...(code.match(/`+/g) ?? []).map((run) => run.length),
      );
      const fence = "`".repeat(longest + 1);
      const info =
        block.attrs.language === "plaintext" ? "" : block.attrs.language;
      return `${fence}${info}\n${code}\n${fence}`;
    }
    case "image":
      return `![${escapeMarkdown(block.attrs.alt)}](<${block.attrs.src}>)`;
    case "embed": {
      const resolved = resolveEmbed(block.attrs.url);
      const label =
        block.attrs.title ??
        (resolved.ok ? embedLabel(resolved.embed) : block.attrs.url);
      return `[${escapeMarkdown(label)}](<${block.attrs.url}>)`;
    }
  }
}

const quote = (text: string) =>
  text
    .split("\n")
    .map((line) => (line === "" ? ">" : `> ${line}`))
    .join("\n");

const blocksMarkdown = (blocks: readonly Block[]) =>
  blocks
    .map(blockMarkdown)
    .filter((text) => text !== "")
    .join("\n\n");

/** CommonMark export, for `.md` routes and llms.txt. */
export function docToMarkdown(doc: Doc): string {
  return blocksMarkdown(doc.content);
}

/** Plain text to a doc: blank lines separate paragraphs, other line breaks become spaces. */
export function textToDoc(text: string): Doc {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter((paragraph) => paragraph !== "");
  return {
    type: "doc",
    content: paragraphs.map((paragraph) => ({
      type: "paragraph",
      content: [{ type: "text", text: paragraph }],
    })),
  };
}
