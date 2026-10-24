import { isBlobImageUrl, type ImageAttrs } from "@aiiman/shared";
import { mergeAttributes, Node } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    image: {
      insertImage: (attrs: ImageAttrs) => ReturnType;
      setImageAlt: (alt: string) => ReturnType;
    };
  }
}

const number = (element: HTMLElement, name: string) => {
  const value = Number(element.getAttribute(name));
  return Number.isInteger(value) && value > 0 ? value : null;
};

/**
 * An uploaded image, same name and attributes as the shared document model.
 * Pasted images from elsewhere aren't parsed: posts only take uploads.
 */
export const Image = Node.create({
  name: "image",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: "" },
      width: { default: null, parseHTML: (el) => number(el, "width") },
      height: { default: null, parseHTML: (el) => number(el, "height") },
      // Kept in the DOM so copy and paste between posts carries it.
      blurDataURL: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-blur"),
        renderHTML: (attrs: { blurDataURL?: string | null }) =>
          attrs.blurDataURL ? { "data-blur": attrs.blurDataURL } : {},
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "img[src]",
        getAttrs: (el) =>
          isBlobImageUrl(el.getAttribute("src")) ? null : false,
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["img", mergeAttributes(HTMLAttributes)];
  },

  addCommands() {
    return {
      insertImage:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
      setImageAlt:
        (alt) =>
        ({ commands }) =>
          commands.updateAttributes(this.name, { alt }),
    };
  },
});
