import "server-only";

import type { Block, CodeBlock, Doc } from "@aiiman/shared";
import type { Root } from "hast";
import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import type { ReactNode } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import rehypePrettyCode from "rehype-pretty-code";
import { unified } from "unified";

import { Pre } from "@/components/mdx/components";
import { prettyCodeOptions } from "@/lib/content/pretty-code";

/** Highlighted output per code block node, for `DocContent`. */
export type HighlightedCode = ReadonlyMap<CodeBlock, ReactNode>;

// Same plugin and options as the MDX pipeline, so the markup (and the CSS
// that switches themes) is identical.
const processor = unified().use(rehypePrettyCode, prettyCodeOptions);

function codeBlocks(blocks: readonly Block[]): CodeBlock[] {
  return blocks.flatMap((block): CodeBlock[] => {
    switch (block.type) {
      case "codeBlock":
        return [block];
      case "bulletList":
      case "orderedList":
        return block.content.flatMap((item) => codeBlocks(item.content));
      case "blockquote":
      case "callout":
        return codeBlocks(block.content);
      default:
        return [];
    }
  });
}

/**
 * Highlights every code block with Shiki. Async, so it runs before the
 * (synchronous) renderer; results are keyed by the node itself.
 */
export async function highlightCodeBlocks(doc: Doc): Promise<HighlightedCode> {
  const highlighted = new Map<CodeBlock, ReactNode>();
  for (const block of codeBlocks(doc.content)) {
    // The hast MDX produces for a fenced block: <pre><code class="language-x">.
    const tree: Root = {
      type: "root",
      children: [
        {
          type: "element",
          tagName: "pre",
          properties: {},
          children: [
            {
              type: "element",
              tagName: "code",
              properties: { className: [`language-${block.attrs.language}`] },
              children: [
                { type: "text", value: block.content?.[0].text ?? "" },
              ],
            },
          ],
        },
      ],
    };
    const result = await processor.run(tree);
    highlighted.set(
      block,
      toJsxRuntime(result, { Fragment, jsx, jsxs, components: { pre: Pre } }),
    );
  }
  return highlighted;
}
