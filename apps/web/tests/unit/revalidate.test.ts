import { describe, expect, it } from "vitest";

import { isAuthorizedRevalidation } from "@/lib/revalidate";

const SECRET = "x".repeat(40);

describe("isAuthorizedRevalidation", () => {
  it("accepts the exact bearer secret", () => {
    expect(isAuthorizedRevalidation(`Bearer ${SECRET}`, SECRET)).toBe(true);
  });

  it.each([
    ["no header", null],
    ["empty header", ""],
    ["wrong secret", `Bearer ${"y".repeat(40)}`],
    ["secret without scheme", SECRET],
    ["prefix of the secret", `Bearer ${SECRET.slice(0, 20)}`],
    ["secret with extra text", `Bearer ${SECRET}x`],
  ])("rejects %s", (_name, header) => {
    expect(isAuthorizedRevalidation(header, SECRET)).toBe(false);
  });
});
