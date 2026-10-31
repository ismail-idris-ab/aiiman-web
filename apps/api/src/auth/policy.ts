import { can, type Action, type Resource } from "@aiiman/shared";
import type { Request, RequestHandler, Response } from "express";
import type { User } from "../store.js";

export const FORBIDDEN = "You don't have access to this.";

/** The signed-in user that requireUser put on the response. */
export function userOf(res: Response): User {
  return res.locals.user as User;
}

/**
 * 403 unless the policy lets the signed-in user perform `action` (on the
 * resource `resourceOf` picks from the request, when the action needs one).
 * Goes after requireUser.
 */
export function allow(
  action: Action,
  resourceOf?: (req: Request, res: Response) => Resource,
): RequestHandler {
  return (req, res, next) => {
    if (!can(userOf(res), action, resourceOf?.(req, res))) {
      res.status(403).json({ error: FORBIDDEN });
      return;
    }
    next();
  };
}
