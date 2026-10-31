import {
  ROLES,
  USER_STATUSES,
  type Photo,
  type ProfileFormInput,
  type Role,
  type UserStatus,
} from "@aiiman/shared";

export type { Role };

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: UserStatus;
  bio?: string;
  photo?: Photo;
  /** False while the user hasn't used their setup link. */
  passwordSet: boolean;
  createdAt: string;
}

export type LoginResult =
  { ok: true; user: User } | { ok: false; error: string };

/** A form submission's outcome: `fields` holds messages to show next to inputs. */
export type FormResult<T> =
  | ({ ok: true } & T)
  | { ok: false; error: string; fields: Record<string, string> };

export const GENERIC_ERROR =
  "Couldn't reach the server. Check your connection.";

export function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

export function isUser(value: unknown): value is User {
  const { id, email, name, role, status, passwordSet, createdAt } =
    record(value);
  return (
    typeof id === "string" &&
    typeof email === "string" &&
    typeof name === "string" &&
    (ROLES as readonly unknown[]).includes(role) &&
    (USER_STATUSES as readonly unknown[]).includes(status) &&
    typeof passwordSet === "boolean" &&
    typeof createdAt === "string"
  );
}

function readUser(body: unknown): User | null {
  const { user } = record(body);
  return isUser(user) ? user : null;
}

export function readError(body: unknown, fallback: string): string {
  const { error } = record(body);
  return typeof error === "string" ? error : fallback;
}

export function readFields(body: unknown): Record<string, string> {
  return Object.fromEntries(
    Object.entries(record(record(body).fields)).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

/** Sends JSON and reads the reply; a failed request or error status becomes a FormResult. */
export async function sendJson<T>(
  path: string,
  method: string,
  body: unknown,
  read: (body: unknown) => T | null,
  fetcher: typeof fetch,
): Promise<FormResult<T>> {
  try {
    const res = await fetcher(path, {
      method,
      headers: body === undefined ? {} : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data: unknown =
      res.status === 204 ? {} : await res.json().catch(() => null);
    const value = res.ok ? read(data) : null;
    if (value !== null) return { ok: true, ...value };
    return {
      ok: false,
      error: readError(data, GENERIC_ERROR),
      fields: readFields(data),
    };
  } catch {
    return { ok: false, error: GENERIC_ERROR, fields: {} };
  }
}

export async function login(
  email: string,
  password: string,
  fetcher: typeof fetch = fetch,
): Promise<LoginResult> {
  const result = await sendJson(
    "/api/auth/login",
    "POST",
    { email, password },
    (body) => {
      const user = readUser(body);
      return user === null ? null : { user };
    },
    fetcher,
  );
  return result.ok
    ? { ok: true, user: result.user }
    : { ok: false, error: result.error };
}

/** The signed-in user, or null when signed out or unreachable. */
export async function currentUser(
  fetcher: typeof fetch = fetch,
): Promise<User | null> {
  try {
    const res = await fetcher("/api/auth/me", { cache: "no-store" });
    if (!res.ok) return null;
    return readUser(await res.json());
  } catch {
    return null;
  }
}

export async function logout(fetcher: typeof fetch = fetch): Promise<void> {
  await fetcher("/api/auth/logout", { method: "POST" }).catch(() => undefined);
}

export type LinkKind = "setup" | "reset";

/** Whether a setup or reset link still works, and whose it is. */
export function checkPasswordLink(
  token: string,
  fetcher: typeof fetch = fetch,
): Promise<FormResult<{ kind: LinkKind; name: string }>> {
  return sendJson(
    "/api/auth/password-link",
    "POST",
    { token },
    (body) => {
      const { kind, name } = record(body);
      return (kind === "setup" || kind === "reset") && typeof name === "string"
        ? { kind, name }
        : null;
    },
    fetcher,
  );
}

/** Sets the password from a link; the user is then signed in. */
export function redeemPasswordLink(
  token: string,
  password: string,
  fetcher: typeof fetch = fetch,
): Promise<FormResult<{ user: User }>> {
  return sendJson(
    "/api/auth/password-link/use",
    "POST",
    { token, password },
    (body) => {
      const user = readUser(body);
      return user === null ? null : { user };
    },
    fetcher,
  );
}

export function changePassword(
  currentPassword: string,
  newPassword: string,
  fetcher: typeof fetch = fetch,
): Promise<FormResult<object>> {
  return sendJson(
    "/api/auth/password",
    "POST",
    { currentPassword, newPassword },
    () => ({}),
    fetcher,
  );
}

export function saveProfile(
  input: ProfileFormInput,
  fetcher: typeof fetch = fetch,
): Promise<FormResult<{ user: User }>> {
  return sendJson(
    "/api/profile",
    "PUT",
    input,
    (body) => {
      const user = readUser(body);
      return user === null ? null : { user };
    },
    fetcher,
  );
}

/**
 * The token from a setup or reset link (`/set-password#<token>`). It lives in
 * the fragment, which browsers never send to a server or in a Referer.
 */
export function linkToken(location: Pick<Location, "pathname" | "hash">) {
  if (location.pathname !== "/set-password") return null;
  const token = location.hash.slice(1);
  return /^[\w-]{43}$/.test(token) ? token : "";
}

export function passwordLinkUrl(origin: string, token: string): string {
  return `${origin}/set-password#${token}`;
}
