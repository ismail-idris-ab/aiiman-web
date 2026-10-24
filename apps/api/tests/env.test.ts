import { describe, expect, it } from "vitest";
import { parseEnv } from "../src/env.js";

describe("parseEnv", () => {
  it("accepts SRV and standard MongoDB URIs", () => {
    expect(
      parseEnv({ MONGODB_URI: "mongodb+srv://u:p@cluster.example.net/db" })
        .MONGODB_URI,
    ).toBeDefined();
    expect(
      parseEnv({ MONGODB_URI: "mongodb://localhost:27017" }).MONGODB_URI,
    ).toBeDefined();
  });

  it("treats a blank value as unset", () => {
    expect(parseEnv({ MONGODB_URI: "" }).MONGODB_URI).toBeUndefined();
  });

  it("rejects non-MongoDB URIs", () => {
    expect(() => parseEnv({ MONGODB_URI: "https://example.com" })).toThrow();
  });
});
