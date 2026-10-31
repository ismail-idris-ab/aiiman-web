import {
  newUserSchema,
  profileInputSchema,
  userAccessSchema,
  type UserResource,
} from "@aiiman/shared";
import { Router, type Request, type Response } from "express";
import { allow, userOf } from "../auth/policy.js";
import {
  createPasswordLink,
  newUserId,
  requireUser,
  type AuthDeps,
} from "../auth/routes.js";
import { fieldErrors } from "../http/fields.js";
import {
  DuplicateEmailError,
  toPublicUser,
  type User,
  type UserChanges,
} from "../store.js";

const EMAIL_TAKEN = "Someone already has an account with this email";
const OWN_ACCESS = "You can't change your own access. Ask another admin.";
const NOT_UPLOADED = "This photo wasn't uploaded here. Upload it again.";

const targetOf = (req: Request): UserResource => ({
  kind: "user",
  id: String(req.params.id),
});

function targetUser(res: Response): User {
  return res.locals.target as User;
}

/** Admins add users, change roles, deactivate and make password links. */
export function usersRouter(deps: AuthDeps): Router {
  const { getStores, log, now } = deps;
  const router = Router();
  router.use(requireUser(deps), allow("user.manage"));

  router.get("/", async (_req, res) => {
    const stores = await getStores();
    res.json({ users: (await stores.users.list()).map(toPublicUser) });
  });

  /** Adds a user without a password, and the setup link for the admin to pass on. */
  router.post("/", async (req, res) => {
    const parsed = newUserSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Check the highlighted fields",
        fields: fieldErrors(parsed.error),
      });
      return;
    }
    const stores = await getStores();
    const user: User = {
      id: newUserId(),
      ...parsed.data,
      status: "active",
      passwordHash: null,
      createdAt: now(),
    };
    try {
      await stores.users.insert(user);
    } catch (error) {
      if (!(error instanceof DuplicateEmailError)) throw error;
      res
        .status(409)
        .json({ error: EMAIL_TAKEN, fields: { email: EMAIL_TAKEN } });
      return;
    }
    const link = await createPasswordLink(stores, user, now());
    log("users.created", {
      userId: user.id,
      role: user.role,
      by: userOf(res).id,
    });
    res.status(201).json({ user: toPublicUser(user), link });
  });

  /** Someone else's account, loaded into res.locals.target; never your own. */
  const loadTarget = [
    (req: Request<{ id: string }>, res: Response, next: () => void) => {
      if (req.params.id === userOf(res).id) {
        res.status(403).json({ error: OWN_ACCESS });
        return;
      }
      next();
    },
    allow("user.access", targetOf),
    async (req: Request<{ id: string }>, res: Response, next: () => void) => {
      const stores = await getStores();
      const target = await stores.users.findById(req.params.id);
      if (target === null) {
        res.status(404).json({ error: "User not found" });
        return;
      }
      res.locals.target = target;
      next();
    },
  ];

  /** Changes a role or status. Deactivating ends every session and link at once. */
  router.patch("/:id", ...loadTarget, async (req, res) => {
    const parsed = userAccessSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Choose a role or status",
        fields: fieldErrors(parsed.error),
      });
      return;
    }
    const target = targetUser(res);
    const stores = await getStores();
    const changes: UserChanges = parsed.data;
    const user = await stores.users.update(target.id, changes);
    if (user === null) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (user.status === "deactivated") {
      await stores.sessions.deleteByUser(user.id);
      await stores.passwordLinks.deleteByUser(user.id);
    }
    log("users.access_changed", {
      userId: user.id,
      ...parsed.data,
      by: userOf(res).id,
    });
    res.json({ user: toPublicUser(user) });
  });

  /** A setup link (no password yet) or reset link; any older one stops working. */
  router.post("/:id/password-link", ...loadTarget, async (_req, res) => {
    const target = targetUser(res);
    if (target.status !== "active") {
      res
        .status(409)
        .json({ error: "Reactivate this user before making them a link." });
      return;
    }
    const stores = await getStores();
    const link = await createPasswordLink(stores, target, now());
    log("users.password_link_created", {
      userId: target.id,
      kind: link.kind,
      by: userOf(res).id,
    });
    res.status(201).json({ link });
  });

  return router;
}

/** Everyone edits their own name, bio and photo. */
export function profileRouter(deps: AuthDeps): Router {
  const { getStores, log } = deps;
  const router = Router();
  router.use(requireUser(deps));

  router.put(
    "/",
    allow("profile.edit", (_req, res) => ({
      kind: "user",
      id: userOf(res).id,
    })),
    async (req, res) => {
      const parsed = profileInputSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: "Check the highlighted fields",
          fields: fieldErrors(parsed.error),
        });
        return;
      }
      const { name, bio, photo } = parsed.data;
      const stores = await getStores();
      // The site reserves layout space from these measurements, so they must be the upload's.
      if (photo !== undefined) {
        const [upload] = await stores.uploads.findByUrls([photo.src]);
        if (
          upload === undefined ||
          upload.width !== photo.width ||
          upload.height !== photo.height ||
          upload.blurDataURL !== photo.blurDataURL
        ) {
          res.status(400).json({
            error: "Check the highlighted fields",
            fields: { photo: NOT_UPLOADED },
          });
          return;
        }
      }
      const user = userOf(res);
      const updated = await stores.users.update(user.id, { name, bio, photo }, [
        ...(bio === undefined ? (["bio"] as const) : []),
        ...(photo === undefined ? (["photo"] as const) : []),
      ]);
      if (updated === null) {
        res.status(404).json({ error: "User not found" });
        return;
      }
      log("profile.updated", { userId: user.id });
      res.json({ user: toPublicUser(updated) });
    },
  );

  return router;
}
