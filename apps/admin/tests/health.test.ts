import { describe, expect, it } from "vitest";
import { fetchHealth, parseHealth } from "../src/health";

describe("parseHealth", () => {
  it("reads a valid response", () => {
    expect(parseHealth({ api: "ok", database: "down" })).toEqual({
      api: "ok",
      database: "down",
    });
  });

  it("treats unexpected shapes as down", () => {
    for (const body of [null, "ok", {}, { api: "ok", database: "yes" }]) {
      expect(parseHealth(body)).toEqual({ api: "down", database: "down" });
    }
  });
});

describe("fetchHealth", () => {
  it("reports everything down when the request fails", async () => {
    const failing = (async () => {
      throw new TypeError("network");
    }) as typeof fetch;
    expect(await fetchHealth(failing)).toEqual({
      api: "down",
      database: "down",
    });
  });

  it("reads the database status from a 503 response", async () => {
    const unhealthy = (async () =>
      Response.json(
        { api: "ok", database: "down" },
        { status: 503 },
      )) as typeof fetch;
    expect(await fetchHealth(unhealthy)).toEqual({
      api: "ok",
      database: "down",
    });
  });
});
