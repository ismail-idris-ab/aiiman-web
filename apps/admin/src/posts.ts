import type { Doc, PostInput, PostStatus } from "@aiiman/shared";

export interface Post {
  id: string;
  slug: string;
  title: string;
  summary: string;
  body: Doc;
  status: PostStatus;
  authorId: string;
  updatedAt: string;
  publishedAt: string | null;
}

export type PostResult =
  | { ok: true; post: Post; revalidated?: boolean }
  | { ok: false; error: string; fields: Record<string, string> };

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
    (post.status === "draft" || post.status === "published") &&
    typeof post.updatedAt === "string"
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
  init: RequestInit,
  fetcher: typeof fetch,
): Promise<PostResult> {
  try {
    const res = await fetcher(path, {
      ...init,
      cache: "no-store",
      headers:
        init.body === undefined
          ? undefined
          : { "content-type": "application/json" },
    });
    const body = record(await res.json().catch(() => null));
    if (res.ok && isPost(body.post)) {
      return {
        ok: true,
        post: body.post,
        ...(typeof body.revalidated === "boolean"
          ? { revalidated: body.revalidated }
          : {}),
      };
    }
    return {
      ok: false,
      error: typeof body.error === "string" ? body.error : GENERIC_ERROR,
      fields: readFields(body.fields),
    };
  } catch {
    return { ok: false, error: GENERIC_ERROR, fields: {} };
  }
}

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

export const createPost = (input: PostInput, fetcher: typeof fetch = fetch) =>
  send("/api/posts", { method: "POST", body: JSON.stringify(input) }, fetcher);

export const updatePost = (
  id: string,
  input: PostInput,
  fetcher: typeof fetch = fetch,
) =>
  send(
    `/api/posts/${encodeURIComponent(id)}`,
    { method: "PUT", body: JSON.stringify(input) },
    fetcher,
  );

export const publishPost = (id: string, fetcher: typeof fetch = fetch) =>
  send(
    `/api/posts/${encodeURIComponent(id)}/publish`,
    { method: "POST" },
    fetcher,
  );

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
