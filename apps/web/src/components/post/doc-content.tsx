import "server-only";

import {
  docHeadings,
  docImages,
  type Block,
  type Doc,
  type Inline,
  type ListItem,
} from "@aiiman/shared";
import { resolveEmbed } from "@aiiman/shared/embed";
import { Fragment, type ReactNode } from "react";

import { Callout, MdxImage, MdxLink } from "@/components/mdx/components";

import { EmbedBlock } from "./embed-block";
import type { HighlightedCode } from "./highlight-code";

/** Top-level blocks after which an image is assumed below the fold (as in remark-content). */
const EARLY_BLOCKS = 3;

/**
 * Renders a post body from the admin as React Server Components, with the
 * same elements, heading anchors, links and callouts the MDX pipeline
 * produces. The doc is already normalised against the shared allowlist, and
 * text is only ever rendered as text, never as HTML.
 */
export function DocContent({
  doc,
  code = new Map(),
  lazyImages = false,
}: {
  doc: Doc;
  /** From `highlightCodeBlocks(doc)`; a block missing here renders unhighlighted. */
  code?: HighlightedCode;
  /** The page already shows a priority image (the cover), so none in the body is. */
  lazyImages?: boolean;
}) {
  // As for MDX: an image in the first few blocks is likely the LCP element.
  const priority = lazyImages
    ? undefined
    : docImages({
        type: "doc",
        content: doc.content.slice(0, EARLY_BLOCKS),
      })[0];

  // Ids in document order, made like rehype-slug does for MDX.
  const ids = docHeadings(doc).map((heading) => heading.id);
  let next = 0;
  const nextId = () => ids[next++] ?? "";

  /** `linked`: inside a heading anchor, where a nested link would be invalid HTML. */
  const inline = (
    content: readonly Inline[] | undefined,
    linked = false,
  ): ReactNode =>
    (content ?? []).map((node, index) => {
      if (node.type === "hardBreak") return <br key={index} />;
      let out: ReactNode = node.text;
      const marks = node.marks ?? [];
      if (marks.some((mark) => mark.type === "code")) out = <code>{out}</code>;
      if (marks.some((mark) => mark.type === "italic")) out = <em>{out}</em>;
      if (marks.some((mark) => mark.type === "bold"))
        out = <strong>{out}</strong>;
      const link = marks.find((mark) => mark.type === "link");
      if (link?.type === "link" && !linked)
        out = <MdxLink href={link.attrs.href}>{out}</MdxLink>;
      return <Fragment key={index}>{out}</Fragment>;
    });

  // A one-paragraph item renders like a tight Markdown list item: no <p> inside.
  const items = (list: readonly ListItem[]) =>
    list.map((item, index) => {
      const [only, ...rest] = item.content;
      return (
        <li key={index}>
          {only?.type === "paragraph" && rest.length === 0
            ? inline(only.content)
            : blocks(item.content)}
        </li>
      );
    });

  const block = (node: Block, index: number): ReactNode => {
    switch (node.type) {
      case "paragraph":
        return node.content === undefined ? null : (
          <p key={index}>{inline(node.content)}</p>
        );
      case "heading": {
        const Tag = `h${node.attrs.level}` as const;
        const id = nextId();
        if (id === "") return <Tag key={index}>{inline(node.content)}</Tag>;
        // rehype-autolink-headings "wrap": the heading text links to itself.
        return (
          <Tag key={index} id={id}>
            <a className="heading-anchor" href={`#${id}`}>
              {inline(node.content, true)}
            </a>
          </Tag>
        );
      }
      case "bulletList":
        return <ul key={index}>{items(node.content)}</ul>;
      case "orderedList":
        return (
          <ol
            key={index}
            start={node.attrs.start === 1 ? undefined : node.attrs.start}
          >
            {items(node.content)}
          </ol>
        );
      case "blockquote":
        return <blockquote key={index}>{blocks(node.content)}</blockquote>;
      case "callout":
        return (
          <Callout key={index} title={node.attrs.title}>
            {blocks(node.content)}
          </Callout>
        );
      case "image":
        return (
          <MdxImage
            key={index}
            src={node.attrs.src}
            alt={node.attrs.alt}
            width={node.attrs.width}
            height={node.attrs.height}
            data-blur={node.attrs.blurDataURL}
            data-priority={node.attrs === priority ? "true" : undefined}
          />
        );
      case "embed": {
        // Normalised docs only hold URLs the resolver accepted.
        const resolved = resolveEmbed(node.attrs.url);
        return resolved.ok ? (
          <EmbedBlock
            key={index}
            embed={resolved.embed}
            title={node.attrs.title}
          />
        ) : null;
      }
      case "codeBlock":
        return (
          <Fragment key={index}>
            {code.get(node) ?? (
              <pre>
                <code>{node.content?.[0].text}</code>
              </pre>
            )}
          </Fragment>
        );
    }
  };

  const blocks = (content: readonly Block[]): ReactNode => content.map(block);

  return blocks(doc.content);
}
