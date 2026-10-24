import { once } from "node:events";
import type { AddressInfo } from "node:net";
import type { Express } from "express";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";

async function request(app: Express, path: string): Promise<Response> {
  const server = app.listen(0);
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  try {
    return await fetch(`http://127.0.0.1:${port}${path}`);
  } finally {
    server.close();
  }
}

describe("GET /api/health", () => {
  it("reports ok when the database answers", async () => {
    const app = createApp({ checkDatabase: async () => true, log: vi.fn() });
    const res = await request(app, "/api/health");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ api: "ok", database: "ok" });
  });

  it("returns 503 when the database is unreachable", async () => {
    const app = createApp({ checkDatabase: async () => false, log: vi.fn() });
    const res = await request(app, "/api/health");
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ api: "ok", database: "down" });
  });

  it("logs only the error name when the check throws", async () => {
    const log = vi.fn();
    const app = createApp({
      checkDatabase: async () => {
        throw new TypeError("mongodb+srv://user:secret@cluster");
      },
      log,
    });
    const res = await request(app, "/api/health");
    expect(res.status).toBe(503);
    expect(log).toHaveBeenCalledWith("api.health_check_failed", {
      error: "TypeError",
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret");
  });
});

describe("other routes", () => {
  it("returns a JSON 404 for unknown paths", async () => {
    const app = createApp({ checkDatabase: async () => true, log: vi.fn() });
    const res = await request(app, "/api/nope");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });

  it("does not advertise Express", async () => {
    const app = createApp({ checkDatabase: async () => true, log: vi.fn() });
    const res = await request(app, "/api/health");
    expect(res.headers.get("x-powered-by")).toBeNull();
  });
});
