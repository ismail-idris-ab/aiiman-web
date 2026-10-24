import { z } from "zod";

export const MAX_BODY_BLOCKS = 2000;
const MAX_TEXT_LENGTH = 20_000;

// Tiptap JSON through an allowlist: unknown node types fail, unknown keys are stripped.
const textNode = z.object({
  type: z.literal("text"),
  text: z.string().min(1).max(MAX_TEXT_LENGTH),
});

const paragraphNode = z.object({
  type: z.literal("paragraph"),
  // Tiptap omits `content` on an empty paragraph.
  content: z.array(textNode).max(500).optional(),
});

export const docSchema = z.object({
  type: z.literal("doc"),
  content: z.array(paragraphNode).max(MAX_BODY_BLOCKS),
});

export type Doc = z.infer<typeof docSchema>;

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

/** The doc's paragraphs as plain text, separated by blank lines. */
export function docToText(doc: Doc): string {
  return doc.content
    .map((paragraph) =>
      (paragraph.content ?? []).map((node) => node.text).join(""),
    )
    .filter((paragraph) => paragraph !== "")
    .join("\n\n");
}
