import { describe, expect, it } from "vitest";
import {
  ACTIONS,
  can,
  ROLES,
  USER_STATUSES,
  type Action,
  type Actor,
  type Resource,
  type Role,
} from "../src/policy.js";

/** The situations every action is checked in. */
const RESOURCES = {
  none: undefined,
  "own draft": { kind: "post", authorId: "me", status: "draft" },
  "own published": { kind: "post", authorId: "me", status: "published" },
  "other's draft": { kind: "post", authorId: "other", status: "draft" },
  "other's published": {
    kind: "post",
    authorId: "other",
    status: "published",
  },
  "own user": { kind: "user", id: "me" },
  "other user": { kind: "user", id: "other" },
} satisfies Record<string, Resource | undefined>;
type Situation = keyof typeof RESOURCES;
const SITUATIONS = Object.keys(RESOURCES) as Situation[];
const POSTS: Situation[] = [
  "own draft",
  "own published",
  "other's draft",
  "other's published",
];

/**
 * The expected answer for an active user, written out by hand from the PRD
 * rather than derived from the implementation: [action][role] → situations
 * where it's allowed.
 */
const ALLOWED: Record<Action, Record<Role, Situation[]>> = {
  "post.create": {
    admin: SITUATIONS,
    editor: SITUATIONS,
    author: SITUATIONS,
  },
  "upload.create": {
    admin: SITUATIONS,
    editor: SITUATIONS,
    author: SITUATIONS,
  },
  "post.read": {
    admin: POSTS,
    editor: POSTS,
    author: ["own draft", "own published"],
  },
  "post.edit": { admin: POSTS, editor: POSTS, author: ["own draft"] },
  "post.publish": { admin: SITUATIONS, editor: SITUATIONS, author: [] },
  "post.feature": { admin: SITUATIONS, editor: SITUATIONS, author: [] },
  "post.indexing": { admin: SITUATIONS, editor: SITUATIONS, author: [] },
  "user.manage": { admin: SITUATIONS, editor: [], author: [] },
  "user.access": { admin: ["other user"], editor: [], author: [] },
  "profile.edit": {
    admin: ["own user"],
    editor: ["own user"],
    author: ["own user"],
  },
};

const cases = ROLES.flatMap((role) =>
  USER_STATUSES.flatMap((status) =>
    ACTIONS.flatMap((action) =>
      SITUATIONS.map((situation) => ({ role, status, action, situation })),
    ),
  ),
);

describe("can", () => {
  it.each(cases)(
    "$role ($status) · $action · $situation",
    ({ role, status, action, situation }) => {
      const actor: Actor = { id: "me", role, status };
      const expected =
        status === "active" && ALLOWED[action][role].includes(situation);
      expect(can(actor, action, RESOURCES[situation])).toBe(expected);
    },
  );

  it("covers every action", () => {
    expect(Object.keys(ALLOWED).sort()).toEqual([...ACTIONS].sort());
  });

  it("refuses everything to nobody", () => {
    for (const action of ACTIONS) {
      for (const situation of SITUATIONS) {
        expect(can(null, action, RESOURCES[situation])).toBe(false);
      }
    }
  });
});
