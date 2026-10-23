import { once } from "node:events";
import type { AddressInfo } from "node:net";
import type { Express } from "express";
import { vi } from "vitest";
import type { AppDeps } from "../src/app.js";
import { createMemoryLimiter } from "../src/auth/limiter.js";
import type { SiteClient } from "../src/site.js";
import type { Stores } from "../src/store.js";

export interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Sent as-is with a JSON content type, for malformed-body tests. */
  rawBody?: string;
  cookie?: string;
  /** Defaults to the server's own origin; pass null to omit the header. */
  origin?: string | null;
  headers?: Record<string, string>;
}

export async function request(
  app: Express,
  path: string,
  {
    method = "GET",
    body,
    rawBody,
    cookie,
    origin,
    headers = {},
  }: RequestOptions = {},
): Promise<Response> {
  const server = app.listen(0);
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;
  const finalHeaders: Record<string, string> = { ...headers };
  if (body !== undefined || rawBody !== undefined) {
    finalHeaders["content-type"] = "application/json";
  }
  if (cookie !== undefined) finalHeaders.cookie = cookie;
  if (origin !== null) finalHeaders.origin = origin ?? base;
  try {
    return await fetch(`${base}${path}`, {
      method,
      headers: finalHeaders,
      body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)),
    });
  } finally {
    server.close();
  }
}

/** A site that answers every call; tests override what they exercise. */
export function testSite(overrides: Partial<SiteClient> = {}): SiteClient {
  return {
    revalidate: async () => true,
    readerUrl: (id) => `https://site.example/api/draft?post=${id}`,
    searchPreview: async () => ({
      title: "Title · Aiiman",
      description: "Description",
      url: "https://site.example/a-post",
      indexed: true,
    }),
    shareImage: async () => new Uint8Array([137, 80, 78, 71]).buffer,
    ...overrides,
  };
}

/** Defaults for every dependency; tests override what they exercise. */
export function testDeps(overrides: Partial<AppDeps> = {}): AppDeps {
  return {
    checkDatabase: async () => true,
    getStores: async (): Promise<Stores> => {
      throw new Error("stores not provided");
    },
    limiter: createMemoryLimiter(),
    log: vi.fn(),
    now: () => new Date(),
    siteSecret: undefined,
    site: testSite(),
    ...overrides,
  };
}

/** "name=value" from a Set-Cookie header, ready to send back. */
export function cookieFrom(res: Response): string {
  const header = res.headers.get("set-cookie") ?? "";
  return header.split(";")[0] ?? "";
}
