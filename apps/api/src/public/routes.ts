import { timingSafeEqual } from "node:crypto";
import {
  calendarDate,
  CONTENT_TIME_ZONE,
  postInputSchema,
  type PreviewPost,
  type PublicPost,
} from "@aiiman/shared";
import { Router, type RequestHandler } from "express";
import type { AuthDeps } from "../auth/routes.js";
import { hashToken } from "../auth/tokens.js";
import type { Post, Stores } from "../store.js";

/**
 * Read-only endpoints the public site builds from. They return published
 * content only, and never cache at the CDN: the site keeps its own cache and
 * refreshes it when told to.
 */
export function publicRouter({ getStores }: Pick<AuthDeps, "getStores">) {
  const router = Router();

  router.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });

  router.get("/posts", async (_req, res) => {
    const stores = await getStores();
    const posts = await stores.posts.listPublished();
    res.json({ posts: await toPublicPosts(stores, posts) });
  });

  router.get("/posts/:slug", async (req, res) => {
    const stores = await getStores();
    const post = await stores.posts.findPublishedBySlug(req.params.slug);
    if (post === null) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const [publicPost] = await toPublicPosts(stores, [post]);
    res.json({ post: publicPost });
  });

  return router;
}

/**
 * Any post by id, for the site's draft-mode preview. Only the site calls it,
 * with SITE_API_SECRET; the preview token it verified names the post.
 */
export function previewRouter({
  getStores,
  secret,
  now,
}: Pick<AuthDeps, "getStores" | "now"> & { secret: string | undefined }) {
  const router = Router();

  const requireSite: RequestHandler = (req, res, next) => {
    res.set("Cache-Control", "no-store");
    const given = hashToken(req.get("authorization") ?? "");
    const expected = hashToken(`Bearer ${secret ?? ""}`);
    if (
      secret === undefined ||
      !timingSafeEqual(Buffer.from(given), Buffer.from(expected))
    ) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    next();
  };

  router.get<{ id: string }>("/posts/:id", requireSite, async (req, res) => {
    const stores = await getStores();
    const post = await stores.posts.findById(req.params.id);
    // Drafts save incomplete; the admin names what to fix before it offers a preview.
    if (post === null || !postInputSchema.safeParse(post).success) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const [publicPost] = await toPublicPosts(stores, [post], now());
    const preview: PreviewPost = {
      ...(publicPost as PublicPost),
      status: post.status,
    };
    res.json({ post: preview });
  });

  return router;
}

async function toPublicPosts(
  stores: Stores,
  posts: readonly Post[],
  now: Date = new Date(),
): Promise<PublicPost[]> {
  const authorIds = [...new Set(posts.map((post) => post.authorId))];
  const names = new Map(
    (await stores.users.findByIds(authorIds)).map((user) => [
      user.id,
      user.name,
    ]),
  );
  // An explicit allowlist: ids, author ids and workflow fields never leave the API.
  return posts.map((post) => ({
    slug: post.slug,
    title: post.title,
    summary: post.summary,
    type: post.type,
    tags: post.tags,
    lang: post.lang,
    // A draft without a date previews as if published today.
    date: post.date ?? calendarDate(now, CONTENT_TIME_ZONE),
    ...(post.updated === undefined ? {} : { updated: post.updated }),
    ...(post.featured === undefined ? {} : { featured: post.featured }),
    ...(post.canonical === undefined ? {} : { canonical: post.canonical }),
    noindex: post.noindex,
    ...(post.cover === undefined ? {} : { cover: post.cover }),
    publishedAt: (post.publishedAt ?? post.updatedAt).toISOString(),
    updatedAt: post.updatedAt.toISOString(),
    authorName: names.get(post.authorId) ?? "",
    body: post.body,
  }));
}
