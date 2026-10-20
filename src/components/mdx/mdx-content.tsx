import "server-only";

import type { MDXComponents } from "mdx/types";
import type { ReactNode } from "react";
import * as runtime from "react/jsx-runtime";

import { mdxComponents, mdxComponentsLazyImages } from "./components";

/** Compiled MDX content is a plain function of props with no hooks. */
type MdxContentFn = (props: { components: MDXComponents }) => ReactNode;

/**
 * Evaluates Velite's compiled MDX (function-body format) on the server.
 * Server-only by design: importing this from a client component would ship
 * code evaluation to the browser and require `'unsafe-eval'` in the CSP.
 */
function evaluate(code: string): MdxContentFn {
  const factory = new Function(code) as (scope: typeof runtime) => {
    default: MdxContentFn;
  };
  return factory({ ...runtime }).default;
}

/** `lazyImages`: the page already shows a priority image (an Entry cover), so none in the body is. */
export function MdxContent({
  code,
  lazyImages = false,
}: {
  code: string;
  lazyImages?: boolean;
}) {
  return evaluate(code)({
    components: lazyImages ? mdxComponentsLazyImages : mdxComponents,
  });
}
