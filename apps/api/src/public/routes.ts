import type { PublicPost } from "@aiiman/shared";
import { Router } from "express";
import type { AuthDeps } from "../auth/routes.js";
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

async function toPublicPosts(
  stores: Stores,
  posts: readonly Post[],
): Promise<PublicPost[]> {
  const authorIds = [...new Set(posts.map((post) => post.authorId))];
  const names = new Map(
    (await stores.users.findByIds(authorIds)).map((user) => [
      user.id,
      user.name,
    ]),
  );
  // An explicit allowlist: drafts' fields, ids and author ids never leave the API.
  return posts.map((post) => ({
    slug: post.slug,
    title: post.title,
    summary: post.summary,
    publishedAt: (post.publishedAt ?? post.updatedAt).toISOString(),
    updatedAt: post.updatedAt.toISOString(),
    authorName: names.get(post.authorId) ?? "",
    body: post.body,
  }));
}
