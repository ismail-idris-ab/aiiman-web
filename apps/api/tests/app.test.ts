import { describe, expect, it, vi } from "vitest";
import { createApp, ServiceUnavailableError } from "../src/app.js";
import { request, testDeps } from "./helpers.js";

describe("GET /api/health", () => {
  it("reports ok when the database answers", async () => {
    const app = createApp(testDeps());
    const res = await request(app, "/api/health");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ api: "ok", database: "ok" });
  });

  it("returns 503 when the database is unreachable", async () => {
    const app = createApp(testDeps({ checkDatabase: async () => false }));
    const res = await request(app, "/api/health");
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ api: "ok", database: "down" });
  });

  it("logs only the error name when the check throws", async () => {
    const log = vi.fn();
    const app = createApp(
      testDeps({
        checkDatabase: async () => {
          throw new TypeError("mongodb+srv://user:secret@cluster");
        },
        log,
      }),
    );
    const res = await request(app, "/api/health");
    expect(res.status).toBe(503);
    expect(log).toHaveBeenCalledWith("api.health_check_failed", {
      error: "TypeError",
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret");
  });
});

describe("cross-cutting behaviour", () => {
  it("returns a JSON 404 for unknown paths", async () => {
    const res = await request(createApp(testDeps()), "/api/nope");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });

  it("does not advertise Express", async () => {
    const res = await request(createApp(testDeps()), "/api/health");
    expect(res.headers.get("x-powered-by")).toBeNull();
  });

  it("rejects state-changing requests from another origin", async () => {
    const app = createApp(testDeps());
    for (const origin of ["https://evil.example", null, "not a url"]) {
      const res = await request(app, "/api/auth/logout", {
        method: "POST",
        origin,
      });
      expect(res.status, String(origin)).toBe(403);
    }
  });

  it("answers 503 when the database isn't configured", async () => {
    const app = createApp(
      testDeps({
        getStores: async () => {
          throw new ServiceUnavailableError("MONGODB_URI is not set");
        },
      }),
    );
    const res = await request(app, "/api/auth/login", {
      method: "POST",
      body: { email: "a@example.com", password: "x" },
    });
    expect(res.status).toBe(503);
  });

  it("answers 400 to malformed JSON without logging an error", async () => {
    const log = vi.fn();
    const app = createApp(testDeps({ log }));
    const res = await request(app, "/api/auth/login", {
      method: "POST",
      rawBody: "{not json",
    });
    expect(res.status).toBe(400);
    expect(log).not.toHaveBeenCalledWith(
      "api.unhandled_error",
      expect.anything(),
    );
  });
});
