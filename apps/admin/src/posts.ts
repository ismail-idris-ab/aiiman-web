import type { DraftInput, PostStatus } from "@aiiman/shared";

/** A post as the API returns it: the writer's fields plus workflow state. */
export type Post = DraftInput & {
  id: string;
  status: PostStatus;
  authorId: string;
  updatedAt: string;
  publishedAt: string | null;
  /** Sent back with every edit, so one made on an older version is refused. */
  version: number;
};

export interface Previews {
  search: { title: string; description: string; url: string; indexed: boolean };
  shareImageUrl: string;
  readerUrl: string;
}

export type PreviewResult =
  | { ok: true; previews: Previews }
  /** `fields`: what the saved post must fix before it can be previewed. */
  | { ok: false; error: string; fields: Record<string, string> };

export type PostResult =
  | {
      ok: true;
      post: Post;
      /** What the saved post still needs before it can go live. */
      issues: Record<string, string>;
      /** Fields a draft was saved without because another post holds the value. */
      unsaved: Record<string, string>;
      revalidated?: boolean;
      /** For a restore: when the restored version was saved. */
      restoredFrom?: string;
    }
  | {
      ok: false;
      error: string;
      fields: Record<string, string>;
      /** Someone saved since this version was loaded: the post as it is now. */
      conflict?: Post;
      /** The connection failed or the server erred: worth trying again. */
      retry?: boolean;
    };

const GENERIC_ERROR = "Couldn't reach the server. Check your connection.";

function isPost(value: unknown): value is Post {
  if (typeof value !== "object" || value === null) return false;
  const post = value as Record<string, unknown>;
  return (
    typeof post.id === "string" &&
    typeof post.slug === "string" &&
    typeof post.title === "string" &&
    typeof post.summary === "string" &&
    typeof post.body === "object" &&
    typeof post.type === "string" &&
    Array.isArray(post.tags) &&
    typeof post.lang === "string" &&
    typeof post.noindex === "boolean" &&
    (post.status === "draft" || post.status === "published") &&
    typeof post.updatedAt === "string" &&
    typeof post.version === "number"
  );
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function readFields(value: unknown): Record<string, string> {
  return Object.fromEntries(
    Object.entries(record(value)).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

async function send(
  path: string,
  init: RequestInit & { version?: number },
  fetcher: typeof fetch,
): Promise<PostResult> {
  const { version, ...rest } = init;
  const headers: Record<string, string> = {};
  if (init.body !== undefined) headers["content-type"] = "application/json";
  if (version !== undefined) headers["if-match"] = `"${version}"`;
  try {
    const res = await fetcher(path, { ...rest, cache: "no-store", headers });
    const body = record(await res.json().catch(() => null));
    if (res.ok && isPost(body.post)) {
      return {
        ok: true,
        post: body.post,
        issues: readFields(body.issues),
        unsaved: readFields(body.unsaved),
        ...(typeof body.revalidated === "boolean"
          ? { revalidated: body.revalidated }
          : {}),
        ...(typeof body.restoredFrom === "string"
          ? { restoredFrom: body.restoredFrom }
          : {}),
      };
    }
    return {
      ok: false,
      error: typeof body.error === "string" ? body.error : GENERIC_ERROR,
      fields: readFields(body.fields),
      ...(res.status === 412 && isPost(body.post)
        ? { conflict: body.post }
        : {}),
      ...(res.status >= 500 ? { retry: true } : {}),
    };
  } catch {
    return { ok: false, error: GENERIC_ERROR, fields: {}, retry: true };
  }
}

export interface SaveOptions {
  /** Saved without the writer asking: folds into the latest revision for a while. */
  autosave?: boolean;
  /** Lets the request finish after the tab closes. */
  keepalive?: boolean;
}

const query = (autosave: boolean | undefined) =>
  autosave ? "?autosave=1" : "";

/** Posts the signed-in user may edit, or null when unreachable. */
export async function listPosts(
  fetcher: typeof fetch = fetch,
): Promise<Post[] | null> {
  try {
    const res = await fetcher("/api/posts", { cache: "no-store" });
    if (!res.ok) return null;
    const { posts } = record(await res.json());
    return Array.isArray(posts) ? posts.filter(isPost) : null;
  } catch {
    return null;
  }
}

export const getPost = (id: string, fetcher: typeof fetch = fetch) =>
  send(`/api/posts/${encodeURIComponent(id)}`, {}, fetcher);

export const createPost = (
  input: DraftInput,
  { autosave, keepalive = false }: SaveOptions = {},
  fetcher: typeof fetch = fetch,
) =>
  send(
    `/api/posts${query(autosave)}`,
    { method: "POST", body: JSON.stringify(input), keepalive },
    fetcher,
  );

/** Saves `input` over `version`; refused with `conflict` if someone saved since. */
export const updatePost = (
  id: string,
  version: number,
  input: DraftInput,
  { autosave, keepalive = false }: SaveOptions = {},
  fetcher: typeof fetch = fetch,
) =>
  send(
    `/api/posts/${encodeURIComponent(id)}${query(autosave)}`,
    { method: "PUT", body: JSON.stringify(input), keepalive, version },
    fetcher,
  );

export interface RevisionSummary {
  id: string;
  version: number;
  kind: "autosave" | "save" | "restore";
  savedAt: string;
  savedBy: string;
  title: string;
  words: number;
  excerpt: string;
}

function isRevision(value: unknown): value is RevisionSummary {
  const revision = record(value);
  return (
    typeof revision.id === "string" &&
    typeof revision.version === "number" &&
    (revision.kind === "autosave" ||
      revision.kind === "save" ||
      revision.kind === "restore") &&
    typeof revision.savedAt === "string" &&
    typeof revision.savedBy === "string" &&
    typeof revision.title === "string" &&
    typeof revision.words === "number" &&
    typeof revision.excerpt === "string"
  );
}

/** The post's saved versions, newest first, or null when unreachable. */
export async function listRevisions(
  id: string,
  fetcher: typeof fetch = fetch,
): Promise<RevisionSummary[] | null> {
  try {
    const res = await fetcher(
      `/api/posts/${encodeURIComponent(id)}/revisions`,
      {
        cache: "no-store",
      },
    );
    if (!res.ok) return null;
    const { revisions } = record(await res.json());
    return Array.isArray(revisions) ? revisions.filter(isRevision) : null;
  } catch {
    return null;
  }
}

/** Puts a saved version back over `version`; the replaced one stays in the history. */
export const restoreRevision = (
  id: string,
  revisionId: string,
  version: number,
  fetcher: typeof fetch = fetch,
) =>
  send(
    `/api/posts/${encodeURIComponent(id)}/revisions/${encodeURIComponent(revisionId)}/restore`,
    { method: "POST", version },
    fetcher,
  );

export const publishPost = (id: string, fetcher: typeof fetch = fetch) =>
  send(
    `/api/posts/${encodeURIComponent(id)}/publish`,
    { method: "POST" },
    fetcher,
  );

function isPreviews(value: unknown): value is Previews {
  const body = record(value);
  const search = record(body.search);
  return (
    typeof search.title === "string" &&
    typeof search.description === "string" &&
    typeof search.url === "string" &&
    typeof search.indexed === "boolean" &&
    typeof body.shareImageUrl === "string" &&
    typeof body.readerUrl === "string"
  );
}

/** Search, share and reader previews of the saved post, rendered by the site. */
export async function previewPost(
  id: string,
  fetcher: typeof fetch = fetch,
): Promise<PreviewResult> {
  try {
    const res = await fetcher(`/api/posts/${encodeURIComponent(id)}/preview`, {
      method: "POST",
      cache: "no-store",
    });
    const body: unknown = await res.json().catch(() => null);
    if (res.ok && isPreviews(body)) return { ok: true, previews: body };
    const { error, fields } = record(body);
    return {
      ok: false,
      error: typeof error === "string" ? error : GENERIC_ERROR,
      fields: readFields(fields),
    };
  } catch {
    return { ok: false, error: GENERIC_ERROR, fields: {} };
  }
}

// Hausa hooked letters have no Unicode decomposition, so NFKD alone would drop them.
const HAUSA: Record<string, string> = { ɓ: "b", ɗ: "d", ƙ: "k", ƴ: "y" };

/** "My First Post!" → "my-first-post". */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[ɓɗƙƴ]/g, (letter) => HAUSA[letter] ?? "")
    .replace(/[ʼ’']/g, "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100)
    .replace(/-+$/, "");
}
