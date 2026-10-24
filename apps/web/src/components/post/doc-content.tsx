import "server-only";

import type { Doc } from "@aiiman/shared";

/**
 * Renders a Tiptap doc from the admin as React elements. Only node types in
 * the shared allowlist exist (the API and the site both validate against it),
 * and text is always rendered as text, never as HTML.
 */
export function DocContent({ doc }: { doc: Doc }) {
  return doc.content.map((paragraph, index) =>
    paragraph.content === undefined ? null : (
      <p key={index}>{paragraph.content.map((node) => node.text).join("")}</p>
    ),
  );
}
