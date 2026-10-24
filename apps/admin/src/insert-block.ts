import type { CommandProps, JSONContent } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";

/**
 * Inserts a block where the cursor is. A just-inserted image or embed stays
 * selected, and inserting over a selection replaces it, so when a whole node
 * is selected the new block goes after it instead.
 */
export function insertBlock(content: JSONContent) {
  return ({ state, commands }: CommandProps) =>
    state.selection instanceof NodeSelection
      ? commands.insertContentAt(state.selection.to, content)
      : commands.insertContent(content);
}
