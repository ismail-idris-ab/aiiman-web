import { randomUUID } from "node:crypto";
import { postInputSchema } from "@aiiman/shared";
import {
  Router,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from "express";
import type { z } from "zod";
import { currentUser, type AuthDeps } from "../auth/routes.js";
import type { SiteRevalidator } from "../revalidate.js";
import {
  SlugTakenError,
  type Post,
  type PostChanges,
  type User,
} from "../store.js";

export interface PostDeps extends AuthDeps {
  revalidateSite: SiteRevalidator;
}

/** Admins and editors work on every post; authors only on their own. */
export function canEdit(user: User, post: Post): boolean {
  return user.role !== "author" || post.authorId === user.id;
}

export function canPublish(user: User): boolean {
  return user.role === "admin" || user.role === "editor";
}

const SLUG_TAKEN = "Another post already uses this slug";
const PUBLISHED_SLUG = "A published post keeps its slug";

/** Field path → first message, for showing errors next to form fields. */
function fieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    fields[key] ??= issue.message;
  }
  return fields;
}

function userOf(res: Response): User {
  return res.locals.user as User;
}

export function postsRouter(deps: PostDeps): Router {
  const { getStores, log, now, revalidateSite } = deps;
  const router = Router();

  const requireUser: RequestHandler = async (req, res, next) => {
    const user = await currentUser(req, deps);
    if (user === null) {
      res.status(401).json({ error: "Not signed in" });
      return;
    }
    res.locals.user = user;
    res.set("Cache-Control", "no-store");
    next();
  };

  /** Loads :id into res.locals.post, or answers 404 (also when the user may not edit it). */
  const loadPost = async (
    req: Request<{ id: string }>,
    res: Response,
    next: NextFunction,
  ) => {
    const stores = await getStores();
    const post = await stores.posts.findById(req.params.id);
    if (post === null || !canEdit(userOf(res), post)) {
      res.status(404).json({ error: "Post not found" });
      return;
    }
    res.locals.post = post;
    next();
  };

  const parseInput = (req: Request, res: Response) => {
    const parsed = postInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Check the highlighted fields",
        fields: fieldErrors(parsed.error),
      });
      return undefined;
    }
    return parsed.data;
  };

  const slugTaken = (res: Response) =>
    res.status(409).json({ error: SLUG_TAKEN, fields: { slug: SLUG_TAKEN } });

  router.use(requireUser);

  router.get("/", async (_req, res) => {
    const user = userOf(res);
    const stores = await getStores();
    const posts = (await stores.posts.list()).filter((post) =>
      canEdit(user, post),
    );
    res.json({ posts });
  });

  router.post("/", async (req, res) => {
    const input = parseInput(req, res);
    if (input === undefined) return;
    const user = userOf(res);
    const time = now();
    const post: Post = {
      id: randomUUID(),
      ...input,
      status: "draft",
      authorId: user.id,
      createdAt: time,
      updatedAt: time,
      publishedAt: null,
    };
    const stores = await getStores();
    try {
      await stores.posts.insert(post);
    } catch (error) {
      if (error instanceof SlugTakenError) return void slugTaken(res);
      throw error;
    }
    log("posts.created", { postId: post.id, userId: user.id });
    res.status(201).json({ post });
  });

  router.get("/:id", loadPost, (_req, res) => {
    res.json({ post: res.locals.post as Post });
  });

  const save = async (
    res: Response,
    post: Post,
    changes: PostChanges,
    event: string,
  ) => {
    const stores = await getStores();
    let saved: Post | null;
    try {
      saved = await stores.posts.update(post.id, changes);
    } catch (error) {
      if (error instanceof SlugTakenError) return void slugTaken(res);
      throw error;
    }
    if (saved === null) {
      res.status(404).json({ error: "Post not found" });
      return;
    }
    log(event, { postId: saved.id, userId: userOf(res).id });
    // Only published content is on the site, so drafts never need a refresh.
    const revalidated =
      saved.status === "published" || post.status === "published"
        ? await revalidateSite()
        : false;
    res.json({ post: saved, revalidated });
  };

  router.put("/:id", loadPost, async (req, res) => {
    const input = parseInput(req, res);
    if (input === undefined) return;
    const post = res.locals.post as Post;
    // Changing a live URL needs a permanent redirect, which arrives with previous slugs.
    if (post.status === "published" && input.slug !== post.slug) {
      res.status(409).json({
        error: PUBLISHED_SLUG,
        fields: { slug: PUBLISHED_SLUG },
      });
      return;
    }
    await save(res, post, { ...input, updatedAt: now() }, "posts.updated");
  });

  router.post("/:id/publish", loadPost, async (_req, res) => {
    if (!canPublish(userOf(res))) {
      res.status(403).json({ error: "Only editors and admins can publish" });
      return;
    }
    const post = res.locals.post as Post;
    // A post saved before the content rules tightened must still pass them to go live.
    const valid = postInputSchema.safeParse(post);
    if (!valid.success) {
      res.status(400).json({
        error: "Fix the highlighted fields before publishing",
        fields: fieldErrors(valid.error),
      });
      return;
    }
    const time = now();
    await save(
      res,
      post,
      {
        status: "published",
        publishedAt: post.publishedAt ?? time,
        updatedAt: time,
      },
      "posts.published",
    );
  });

  return router;
}
