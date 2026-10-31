import type { NewUserInput, Role, UserStatus } from "@aiiman/shared";
import {
  isUser,
  record,
  sendJson,
  type FormResult,
  type LinkKind,
  type User,
} from "./auth";

/** A setup or reset link's secret part; the admin passes the full link on. */
export interface PasswordLink {
  token: string;
  kind: LinkKind;
  expiresAt: string;
}

function readLink(value: unknown): PasswordLink | null {
  const { token, kind, expiresAt } = record(value);
  return typeof token === "string" &&
    (kind === "setup" || kind === "reset") &&
    typeof expiresAt === "string"
    ? { token, kind, expiresAt }
    : null;
}

function readUserBody(body: unknown) {
  const { user } = record(body);
  return isUser(user) ? { user } : null;
}

/** Everyone, for admins; null when the list couldn't be loaded. */
export async function listUsers(
  fetcher: typeof fetch = fetch,
): Promise<User[] | null> {
  try {
    const res = await fetcher("/api/users", { cache: "no-store" });
    if (!res.ok) return null;
    const { users } = record(await res.json());
    return Array.isArray(users) && users.every(isUser) ? users : null;
  } catch {
    return null;
  }
}

export function addUser(
  input: NewUserInput,
  fetcher: typeof fetch = fetch,
): Promise<FormResult<{ user: User; link: PasswordLink }>> {
  return sendJson(
    "/api/users",
    "POST",
    input,
    (body) => {
      const user = readUserBody(body);
      const link = readLink(record(body).link);
      return user === null || link === null ? null : { ...user, link };
    },
    fetcher,
  );
}

export function changeAccess(
  id: string,
  change: { role: Role } | { status: UserStatus },
  fetcher: typeof fetch = fetch,
): Promise<FormResult<{ user: User }>> {
  return sendJson(
    `/api/users/${encodeURIComponent(id)}`,
    "PATCH",
    change,
    readUserBody,
    fetcher,
  );
}

export function makePasswordLink(
  id: string,
  fetcher: typeof fetch = fetch,
): Promise<FormResult<{ link: PasswordLink }>> {
  return sendJson(
    `/api/users/${encodeURIComponent(id)}/password-link`,
    "POST",
    undefined,
    (body) => {
      const link = readLink(record(body).link);
      return link === null ? null : { link };
    },
    fetcher,
  );
}
