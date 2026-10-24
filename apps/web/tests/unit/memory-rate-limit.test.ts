import { describe, expect, it } from "vitest";

import { createMemoryRateLimit } from "@/lib/newsletter/memory-rate-limit";

function limiter(maxKeys?: number) {
  let time = 0;
  const limit = createMemoryRateLimit({
    limit: 2,
    windowMs: 1000,
    now: () => time,
    ...(maxKeys === undefined ? {} : { maxKeys }),
  });
  return {
    limit,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

describe("createMemoryRateLimit", () => {
  it("allows up to the limit per key within a window", () => {
    const { limit } = limiter();
    expect([limit("a"), limit("a"), limit("a")]).toEqual([true, true, false]);
    expect(limit("b")).toBe(true);
  });

  it("opens a new window once the old one expires", () => {
    const { limit, advance } = limiter();
    limit("a");
    limit("a");
    expect(limit("a")).toBe(false);
    advance(1000);
    expect(limit("a")).toBe(true);
  });

  it("caps tracked keys by evicting expired, then oldest, windows", () => {
    const { limit } = limiter(2);
    limit("a");
    limit("a");
    limit("b");
    limit("c"); // evicts "a", the oldest live window
    expect(limit("a")).toBe(true);
  });
});
