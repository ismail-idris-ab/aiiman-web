import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import {
  docToText,
  OPTIONAL_POST_FIELDS,
  wordCount,
  type DraftInput,
} from "@aiiman/shared";
import type { Post, Revision, RevisionKind, Stores } from "../store.js";

/** Revisions kept per post. */
export const KEEP_REVISIONS = 10;

/** How long autosaves keep folding into the same revision. */
export const AUTOSAVE_WINDOW_MS = 5 * 60 * 1000;

export interface RevisionWrite {
  kind: RevisionKind;
  userId: string;
  at: Date;
  content: DraftInput;
}

/**
 * Whether a write updates the newest revision instead of adding one. Autosaves
 * every few seconds would push out the whole history in under a minute, so a
 * writer's autosaves fold into one revision for AUTOSAVE_WINDOW_MS. A save the
 * writer chose, a restore or another person's write always starts a new one,
 * except when nothing changed.
 */
export function foldsInto(latest: Revision | null, write: RevisionWrite) {
  if (latest === null) return false;
  if (isDeepStrictEqual(latest.content, write.content)) return true;
  return (
    write.kind === "autosave" &&
    latest.kind === "autosave" &&
    latest.savedBy === write.userId &&
    write.at.getTime() - latest.createdAt.getTime() < AUTOSAVE_WINDOW_MS
  );
}

/** The editable fields of a post, as a revision keeps them. */
export function contentOf(post: Post): DraftInput {
  const content: DraftInput = {
    title: post.title,
    summary: post.summary,
    slug: post.slug,
    body: post.body,
    type: post.type,
    tags: post.tags,
    lang: post.lang,
    noindex: post.noindex,
  };
  for (const key of OPTIONAL_POST_FIELDS) {
    if (post[key] !== undefined) Object.assign(content, { [key]: post[key] });
  }
  return content;
}

/** Records a write of `post` in its history. */
export async function recordRevision(
  stores: Stores,
  post: Post,
  { kind, userId, at }: Omit<RevisionWrite, "content">,
): Promise<void> {
  const content = contentOf(post);
  const [latest = null] = await stores.revisions.list(post.id);
  if (foldsInto(latest, { kind, userId, at, content })) {
    // Folding keeps the revision's kind: an autosave of a restored version stays "restore".
    await stores.revisions.replace({
      ...(latest as Revision),
      version: post.version,
      content,
      savedBy: userId,
      savedAt: at,
    });
    return;
  }
  await stores.revisions.insert(
    {
      id: randomUUID(),
      postId: post.id,
      version: post.version,
      kind,
      content,
      savedBy: userId,
      createdAt: at,
      savedAt: at,
    },
    KEEP_REVISIONS,
  );
}

const EXCERPT_LENGTH = 140;

/** What the history list shows about a revision. */
export function revisionSummary(revision: Revision, savedByName: string) {
  const text = docToText(revision.content.body).replace(/\s+/g, " ").trim();
  return {
    id: revision.id,
    version: revision.version,
    kind: revision.kind,
    savedAt: revision.savedAt,
    savedBy: savedByName,
    title: revision.content.title,
    words: wordCount(revision.content.body),
    excerpt:
      text.length > EXCERPT_LENGTH
        ? `${text.slice(0, EXCERPT_LENGTH).trimEnd()}…`
        : text,
  };
}
