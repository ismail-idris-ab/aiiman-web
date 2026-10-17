/**
 * Remark plugin for Entry bodies:
 * 1. Fails the build on body-level rule violations (h1, missing alt).
 * 2. Copies colocated images to the public assets dir and stamps their
 *    width, height and blur placeholder onto the node so `next/image`
 *    can render them without layout shift.
 *
 * Replaces Velite's built-in `copyLinkedFiles`, which copies images
 * without recording their dimensions.
 */

import { isRelativePath, processAsset } from "velite";

import { findBodyIssues, walk, type MdNode } from "./rules";

interface AssetOutput {
  name: string;
  base: string;
}

interface ImageNode extends MdNode {
  type: "image";
  url: string;
  data?: { hProperties?: Record<string, unknown> };
}

const isImageNode = (node: MdNode): node is ImageNode =>
  node.type === "image" && typeof node.url === "string";

export function remarkContent(output: AssetOutput) {
  return async (tree: MdNode, file: { path: string }) => {
    const issues = findBodyIssues(tree);
    if (issues.length > 0) {
      throw new Error(`${file.path}:\n  - ${issues.join("\n  - ")}`);
    }

    const images: ImageNode[] = [];
    walk(tree, (node) => {
      if (isImageNode(node) && isRelativePath(node.url)) images.push(node);
    });

    await Promise.all(
      images.map(async (node) => {
        const image = await processAsset(
          node.url,
          file.path,
          output.name,
          output.base,
          true,
        );
        node.url = image.src;
        node.data = {
          ...node.data,
          hProperties: {
            ...node.data?.hProperties,
            width: image.width,
            height: image.height,
            "data-blur": image.blurDataURL,
          },
        };
      }),
    );
  };
}
