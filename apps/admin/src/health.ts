export type Status = "ok" | "down";

export interface Health {
  api: Status;
  database: Status;
}

const DOWN: Health = { api: "down", database: "down" };

function isStatus(value: unknown): value is Status {
  return value === "ok" || value === "down";
}

/** Reads the health response; any unexpected shape counts as down. */
export function parseHealth(body: unknown): Health {
  if (typeof body !== "object" || body === null) return DOWN;
  const { api, database } = body as Record<string, unknown>;
  if (!isStatus(api) || !isStatus(database)) return DOWN;
  return { api, database };
}

export async function fetchHealth(
  fetcher: typeof fetch = fetch,
): Promise<Health> {
  try {
    const res = await fetcher("/api/health", { cache: "no-store" });
    return parseHealth(await res.json());
  } catch {
    return DOWN;
  }
}
