import { randomUUID } from "node:crypto";
import {
  calendarDate,
  CONTENT_TIME_ZONE,
  docImages,
  draftInputSchema,
  missingRequiredPages,
  OPTIONAL_POST_FIELDS,
  postInputSchema,
  type DraftInput,
  type PostStatus,
} from "@aiiman/shared";
import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import type { z } from "zod";
import { requireUser, type AuthDeps } from "../auth/routes.js";
import { SiteUnavailableError, type SiteClient } from "../site.js";
import {
  DuplicateFieldError,
  type Post,
  type PostChanges,
  type RevisionKind,
  type Stores,
  type User,
} from "../store.js";
import { recordRevision, revisionSummary } from "./revisions.js";

export interface PostDeps extends AuthDeps {
  site: SiteClient;
}

/** Admins and editors work on every post; authors only on their own. */
export function canEdit(user: User, post: Post): boolean {
  return user.role !== "author" || post.authorId === user.id;
}

export function canPublish(user: User): boolean {
  return user.role === "admin" || user.role === "editor";
}

const DUPLICATE: Record<DuplicateFieldError["field"], string> = {
  slug: "Another post already uses this slug",
  featured: "Another post already has this featured position",
};
const NOT_SAVED: Record<DuplicateFieldError["field"], string> = {
  slug: "Another post already uses this slug, so it wasn't saved. The rest of the draft is.",
  featured:
    "Another post already has this featured position, so it wasn't saved. The rest of the draft is.",
};
const PUBLISHED_SLUG = "A published post keeps its slug";
const SITE_UNAVAILABLE =
  "Previews need the site connection. Try again, or check SITE_URL and SITE_API_SECRET.";

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

function postOf(res: Response): Post {
  return res.locals.post as Post;
}

const NOT_UPLOADED = "This image wasn't uploaded here. Upload it again.";

/**
 * Field errors for images the API didn't upload, or whose measurements
 * differ from the upload's: the site trusts them to reserve layout space.
 */
async function unknownImages(
  stores: Stores,
  input: DraftInput,
): Promise<Record<string, string>> {
  const images = [
    ...docImages(input.body).map((image) => ["body", image] as const),
    ...(input.cover === undefined ? [] : [["cover", input.cover] as const]),
  ];
  if (images.length === 0) return {};
  const uploads = new Map(
    (
      await stores.uploads.findByUrls([
        ...new Set(images.map(([, image]) => image.src)),
      ])
    ).map((upload) => [upload.url, upload]),
  );
  const fields: Record<string, string> = {};
  for (const [field, image] of images) {
    const upload = uploads.get(image.src);
    if (
      upload === undefined ||
      upload.width !== image.width ||
      upload.height !== image.height ||
      upload.blurDataURL !== image.blurDataURL
    ) {
      fields[field] = NOT_UPLOADED;
    }
  }
  return fields;
}

/** Optional fields the input leaves out, which an edit clears. */
function absentFields(input: DraftInput): string[] {
  return OPTIONAL_POST_FIELDS.filter((key) => input[key] === undefined);
}

/** Field messages for what keeps a saved post from going live; empty when it can. */
function publishingIssues(post: Post): Record<string, string> {
  const valid = postInputSchema.safeParse(post);
  return valid.success ? {} : fieldErrors(valid.error);
}

const CHANGED =
  "This post was saved somewhere else (another tab, device or person) since you opened it.";

/** The version an edit was made on, from `If-Match: "3"`. */
function baseVersion(req: Request): number | undefined {
  const match = /^"(\d+)"$/.exec(req.get("if-match")?.trim() ?? "");
  return match === null ? undefined : Number(match[1]);
}

export function postsRouter(deps: PostDeps): Router {
  const { getStores, log, now, site } = deps;
  const router = Router();

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

  /**
   * A draft saves with whatever the writer has so far; a published post's
   * edits go live, so they must meet the publishing rules.
   */
  const parseInput = async (
    body: unknown,
    res: Response,
    status: PostStatus = "draft",
    error = "Check the highlighted fields",
  ): Promise<DraftInput | undefined> => {
    const parsed = (
      status === "published" ? postInputSchema : draftInputSchema
    ).safeParse(body);
    const fields = parsed.success
      ? await unknownImages(await getStores(), parsed.data)
      : fieldErrors(parsed.error);
    if (!parsed.success || Object.keys(fields).length > 0) {
      res.status(400).json({ error, fields });
      return undefined;
    }
    return parsed.data;
  };

  /** Answers 400 with the fields to fix when a saved post can't go live yet. */
  const meetsPublishingRules = (
    res: Response,
    post: Post,
    action: "publishing" | "previewing",
  ) => {
    const fields = publishingIssues(post);
    if (Object.keys(fields).length === 0) return true;
    res.status(400).json({
      error: `Fix the highlighted fields before ${action}`,
      fields,
    });
    return false;
  };

  /** Autosaves only come from the editor of a draft. */
  const kindOf = (req: Request): RevisionKind =>
    req.query.autosave === "1" ? "autosave" : "save";

  /** The post and what it still needs before it can go live. */
  const reply = (post: Post, extra: Record<string, unknown> = {}) => ({
    post,
    issues: publishingIssues(post),
    ...extra,
  });

  const duplicate = (res: Response, error: DuplicateFieldError) =>
    res.status(409).json({
      error: DUPLICATE[error.field],
      fields: { [error.field]: DUPLICATE[error.field] },
    });

  router.use(requireUser(deps));

  router.get("/", async (_req, res) => {
    const user = userOf(res);
    const stores = await getStores();
    const posts = (await stores.posts.list()).filter((post) =>
      canEdit(user, post),
    );
    res.json({ posts });
  });

  router.post("/", async (req, res) => {
    const input = await parseInput(req.body, res);
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
      version: 1,
    };
    const stores = await getStores();
    const unsaved: Record<string, string> = {};
    for (;;) {
      try {
        await stores.posts.insert(post);
        break;
      } catch (error) {
        if (!(error instanceof DuplicateFieldError)) throw error;
        if (error.field in unsaved) return void duplicate(res, error);
        // A draft saves without the clashing value rather than losing its text.
        unsaved[error.field] = NOT_SAVED[error.field];
        if (error.field === "slug") post.slug = "";
        else delete post.featured;
      }
    }
    await recordRevision(stores, post, {
      kind: kindOf(req),
      userId: user.id,
      at: time,
    });
    log("posts.created", { postId: post.id, userId: user.id });
    res.status(201).json(reply(post, { unsaved }));
  });

  router.get("/:id", loadPost, (_req, res) => {
    res.json(reply(postOf(res)));
  });

  /**
   * Writes `changes` if the post is still at `base` (or unconditionally
   * without one), records the revision and refreshes the site if live
   * content changed. Answers 412 with the current post when someone else
   * saved first, so no edit silently overwrites another.
   */
  const save = async (
    res: Response,
    post: Post,
    changes: PostChanges,
    {
      unset = [],
      base,
      revision,
      event,
      extra = {},
    }: {
      unset?: readonly string[];
      base?: number;
      revision?: RevisionKind;
      event?: string;
      extra?: Record<string, unknown>;
    },
  ) => {
    const stores = await getStores();
    const user = userOf(res);
    let saved: Post | null;
    const unsaved: Record<string, string> = {};
    for (;;) {
      try {
        saved = await stores.posts.update(post.id, changes, unset, base);
        break;
      } catch (error) {
        if (!(error instanceof DuplicateFieldError)) throw error;
        const { field } = error;
        if (post.status !== "draft" || !(field in changes) || field in unsaved)
          return void duplicate(res, error);
        // A draft saves without the clashing value rather than losing its text:
        // the field keeps what was stored, and the writer is told.
        unsaved[field] = NOT_SAVED[field];
        changes =
          post[field] === undefined
            ? (Object.fromEntries(
                Object.entries(changes).filter(([key]) => key !== field),
              ) as PostChanges)
            : { ...changes, [field]: post[field] };
        unset =
          post[field] === undefined
            ? [...unset, field]
            : unset.filter((key) => key !== field);
      }
    }
    if (saved === null) {
      const current = await stores.posts.findById(post.id);
      if (current === null || !canEdit(user, current)) {
        res.status(404).json({ error: "Post not found" });
      } else {
        res.status(412).json({ error: CHANGED, post: current });
      }
      return;
    }
    if (revision !== undefined) {
      await recordRevision(stores, saved, {
        kind: revision,
        userId: user.id,
        at: changes.updatedAt,
      });
    }
    if (event !== undefined) log(event, { postId: saved.id, userId: user.id });
    // Only published content is on the site, so drafts never need a refresh.
    const revalidated =
      saved.status === "published" || post.status === "published"
        ? await site.revalidate()
        : false;
    res.json(reply(saved, { revalidated, unsaved, ...extra }));
  };

  /** Writes new editable fields onto the post, as an edit or a restore. */
  const write = async (
    res: Response,
    post: Post,
    input: DraftInput,
    base: number,
    kind: RevisionKind,
    extra: Record<string, unknown> = {},
  ) => {
    // Changing a live URL needs a permanent redirect, which arrives with previous slugs.
    if (post.status === "published" && input.slug !== post.slug) {
      res.status(409).json({
        error: PUBLISHED_SLUG,
        fields: { slug: PUBLISHED_SLUG },
      });
      return;
    }
    // A published post always has a date; clearing it keeps the original.
    const keepDate = post.status === "published" && input.date === undefined;
    await save(
      res,
      post,
      { ...input, ...(keepDate ? { date: post.date } : {}), updatedAt: now() },
      {
        unset: absentFields(input).filter(
          (key) => !(keepDate && key === "date"),
        ),
        base,
        revision: kind,
        // Autosaves arrive every few seconds; the revision history records them.
        ...(kind === "autosave" ? {} : { event: `posts.${kind}d` }),
        extra,
      },
    );
  };

  /** The If-Match version, or answers 428: every edit must say what it was based on. */
  const requireBase = (req: Request, res: Response) => {
    const base = baseVersion(req);
    if (base === undefined) {
      res.status(428).json({ error: "Reload the post and try again." });
    }
    return base;
  };

  router.put("/:id", loadPost, async (req, res) => {
    const base = requireBase(req, res);
    if (base === undefined) return;
    const post = postOf(res);
    const kind = kindOf(req);
    if (kind === "autosave" && post.status === "published") {
      res.status(409).json({
        error:
          "Changes to a published post go live, so they're only saved when you choose to.",
      });
      return;
    }
    const input = await parseInput(req.body, res, post.status);
    if (input === undefined) return;
    await write(res, post, input, base, kind);
  });

  router.get("/:id/revisions", loadPost, async (_req, res) => {
    const stores = await getStores();
    const revisions = await stores.revisions.list(postOf(res).id);
    const users = new Map(
      (
        await stores.users.findByIds([
          ...new Set(revisions.map((revision) => revision.savedBy)),
        ])
      ).map((user) => [user.id, user.name]),
    );
    res.json({
      revisions: revisions.map((revision) =>
        revisionSummary(
          revision,
          users.get(revision.savedBy) ?? "A removed user",
        ),
      ),
    });
  });

  /** Puts a revision's fields back. The version it replaces stays in the history. */
  router.post(
    "/:id/revisions/:revisionId/restore",
    loadPost,
    async (req: Request<{ id: string; revisionId: string }>, res) => {
      const base = requireBase(req, res);
      if (base === undefined) return;
      const post = postOf(res);
      const stores = await getStores();
      const revision = await stores.revisions.find(
        post.id,
        req.params.revisionId,
      );
      if (revision === null) {
        res.status(404).json({ error: "That version is no longer kept." });
        return;
      }
      const input = await parseInput(
        revision.content,
        res,
        post.status,
        "This version doesn't meet the rules for a published post, so it can't go live.",
      );
      if (input === undefined) return;
      await write(res, post, input, base, "restore", {
        restoredFrom: revision.savedAt,
      });
    },
  );

  router.post("/:id/publish", loadPost, async (_req, res) => {
    if (!canPublish(userOf(res))) {
      res.status(403).json({ error: "Only editors and admins can publish" });
      return;
    }
    const post = postOf(res);
    // Drafts save incomplete, so the saved post must meet the rules to go live.
    if (!meetsPublishingRules(res, post, "publishing")) return;
    const stores = await getStores();
    const missing = missingRequiredPages(await stores.pages.publishedSlugs());
    if (missing.length > 0) {
      res.status(409).json({
        error: `Publish these pages first, every page links to them: ${missing.join(", ")}`,
      });
      return;
    }
    const time = now();
    await save(
      res,
      post,
      {
        status: "published",
        date: post.date ?? calendarDate(time, CONTENT_TIME_ZONE),
        publishedAt: post.publishedAt ?? time,
        updatedAt: time,
      },
      // Only the date can change, so the latest revision still holds the content.
      { event: "posts.published" },
    );
  });

  /** Search result, share card and reader links for the saved version of the post. */
  router.post("/:id/preview", loadPost, async (_req, res) => {
    const post = postOf(res);
    // The site renders previews with its publishing schema.
    if (!meetsPublishingRules(res, post, "previewing")) return;
    try {
      const search = await site.searchPreview(post.id);
      res.json({
        search,
        // Same origin as the admin, so its strict CSP allows the image.
        shareImageUrl: `/api/posts/${encodeURIComponent(post.id)}/share-image?v=${post.updatedAt.getTime()}`,
        readerUrl: site.readerUrl(post.id),
      });
    } catch (error) {
      if (!(error instanceof SiteUnavailableError)) throw error;
      res.status(503).json({ error: SITE_UNAVAILABLE });
    }
  });

  router.get("/:id/share-image", loadPost, async (_req, res) => {
    try {
      const image = await site.shareImage(postOf(res).id);
      res.type("png").send(Buffer.from(image));
    } catch (error) {
      if (!(error instanceof SiteUnavailableError)) throw error;
      res.status(503).json({ error: SITE_UNAVAILABLE });
    }
  });

  return router;
}
