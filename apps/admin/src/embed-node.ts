import { embedLabel, resolveEmbed } from "@aiiman/shared";
import { mergeAttributes, Node } from "@tiptap/core";
import { insertBlock } from "./insert-block";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    embed: {
      insertEmbed: (attrs: { url: string; title?: string }) => ReturnType;
    };
  }
}

/** What the editor shows for an embed: a labelled box, never the third-party frame. */
export function embedCaption(url: string, title: string | null): string {
  const resolved = resolveEmbed(url);
  if (!resolved.ok) return url;
  return `${title ?? embedLabel(resolved.embed)} · ${url}`;
}

/**
 * An embedded post or video, same name and attributes as the shared document
 * model. The admin's CSP has no frame sources, so it is a box with the link;
 * the site turns it into a tap-to-load embed.
 */
export const Embed = Node.create({
  name: "embed",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      url: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-url"),
        renderHTML: (attrs: { url?: string | null }) => ({
          "data-url": attrs.url,
        }),
      },
      title: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-title"),
        renderHTML: (attrs: { title?: string | null }) =>
          attrs.title ? { "data-title": attrs.title } : {},
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "div[data-embed]",
        getAttrs: (el) =>
          resolveEmbed(el.getAttribute("data-url") ?? "").ok ? null : false,
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const { url, title } = node.attrs as { url: string; title: string | null };
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-embed": "" }),
      embedCaption(url, title),
    ];
  },

  addCommands() {
    return {
      insertEmbed: (attrs) => insertBlock({ type: this.name, attrs }),
    };
  },
});
