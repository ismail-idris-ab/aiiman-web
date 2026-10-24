import { mergeAttributes, Node } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    callout: {
      /** Wraps the selected blocks in a callout, or unwraps them. */
      toggleCallout: () => ReturnType;
      setCalloutTitle: (title: string) => ReturnType;
    };
  }
}

/**
 * A boxed aside ("Store kobo, not naira"), the admin's version of the MDX
 * `<Callout>`. Same name and attributes as the shared document model.
 */
export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      title: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-title"),
        renderHTML: (attributes: { title?: string | null }) =>
          attributes.title ? { "data-title": attributes.title } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: "aside[data-callout]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "aside",
      mergeAttributes(HTMLAttributes, { "data-callout": "", role: "note" }),
      0,
    ];
  },

  addCommands() {
    return {
      toggleCallout:
        () =>
        ({ commands }) =>
          commands.toggleWrap(this.name),
      setCalloutTitle:
        (title) =>
        ({ commands }) =>
          commands.updateAttributes(this.name, {
            title: title.trim() === "" ? null : title.trim(),
          }),
    };
  },
});
