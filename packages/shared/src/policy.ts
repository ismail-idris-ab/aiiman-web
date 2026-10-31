/**
 * Who may do what. One pure function answers for every API endpoint, and the
 * admin uses the same answers to decide which controls to show. No
 * dependencies, so the admin bundle can import it cheaply.
 */

export const ROLES = ["admin", "editor", "author"] as const;
export type Role = (typeof ROLES)[number];

export const USER_STATUSES = ["active", "deactivated"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  editor: "Editor",
  author: "Author",
};

export interface Actor {
  id: string;
  role: Role;
  status: UserStatus;
}

/** The parts of a post the policy looks at. */
export interface PostResource {
  kind: "post";
  authorId: string;
  status: string;
}

/** The parts of a user the policy looks at. */
export interface UserResource {
  kind: "user";
  id: string;
}

export type Resource = PostResource | UserResource;

export const ACTIONS = [
  /** Start a new post. */
  "post.create",
  /** Open a post: list it, read it, its history and previews. */
  "post.read",
  /** Change a post's fields, or restore one of its versions. */
  "post.edit",
  "post.publish",
  /** Set or change a post's featured position. */
  "post.feature",
  /** Set a post's canonical URL or hide it from search engines. */
  "post.indexing",
  "upload.create",
  /** See every user and create new ones. */
  "user.manage",
  /** Change another user's role or status, or make them a password link. */
  "user.access",
  /** Edit a profile (name, bio, photo) and change its password. */
  "profile.edit",
] as const;
export type Action = (typeof ACTIONS)[number];

const EDITORS: readonly Role[] = ["admin", "editor"];

/**
 * Whether `actor` may perform `action` on `resource`. Deactivated users and
 * missing resources fail every check that needs them.
 */
export function can(
  actor: Actor | null,
  action: Action,
  resource?: Resource,
): boolean {
  if (actor === null || actor.status !== "active") return false;
  const editor = EDITORS.includes(actor.role);
  switch (action) {
    case "post.create":
    case "upload.create":
      return true;
    case "post.read":
      return (
        resource?.kind === "post" && (editor || resource.authorId === actor.id)
      );
    case "post.edit":
      // Authors work on their own drafts; once a post is live, editors own it.
      return (
        resource?.kind === "post" &&
        (editor ||
          (resource.authorId === actor.id && resource.status === "draft"))
      );
    case "post.publish":
    case "post.feature":
    case "post.indexing":
      return editor;
    case "user.manage":
      return actor.role === "admin";
    case "user.access":
      // Never on yourself, so the last admin can't lock everyone out.
      return (
        actor.role === "admin" &&
        resource?.kind === "user" &&
        resource.id !== actor.id
      );
    case "profile.edit":
      return resource?.kind === "user" && resource.id === actor.id;
  }
}
