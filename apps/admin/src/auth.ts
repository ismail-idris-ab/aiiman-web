export type Role = "admin" | "editor" | "author";

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export type LoginResult =
  { ok: true; user: User } | { ok: false; error: string };

const GENERIC_ERROR = "Couldn't reach the server. Check your connection.";

function isUser(value: unknown): value is User {
  if (typeof value !== "object" || value === null) return false;
  const { id, email, name, role } = value as Record<string, unknown>;
  return (
    typeof id === "string" &&
    typeof email === "string" &&
    typeof name === "string" &&
    (role === "admin" || role === "editor" || role === "author")
  );
}

function readUser(body: unknown): User | null {
  if (typeof body !== "object" || body === null) return null;
  const { user } = body as Record<string, unknown>;
  return isUser(user) ? user : null;
}

function readError(body: unknown, fallback: string): string {
  if (typeof body !== "object" || body === null) return fallback;
  const { error } = body as Record<string, unknown>;
  return typeof error === "string" ? error : fallback;
}

export async function login(
  email: string,
  password: string,
  fetcher: typeof fetch = fetch,
): Promise<LoginResult> {
  try {
    const res = await fetcher("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const body: unknown = await res.json().catch(() => null);
    const user = res.ok ? readUser(body) : null;
    if (user !== null) return { ok: true, user };
    return { ok: false, error: readError(body, GENERIC_ERROR) };
  } catch {
    return { ok: false, error: GENERIC_ERROR };
  }
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
