// __Host- prefix: browsers only accept it with Secure, Path=/ and no Domain,
// so a subdomain can never set or overwrite it.
export const SESSION_COOKIE = "__Host-aiiman_session";

export function readCookie(
  header: string | undefined,
  name: string,
): string | undefined {
  if (header === undefined) return undefined;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) {
      return part.slice(index + 1).trim();
    }
  }
  return undefined;
}

export function sessionCookie(token: string, maxAgeSeconds: number): string {
  return `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; Secure; SameSite=Strict`;
}

export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}
