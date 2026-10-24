import { describe, expect, it } from "vitest";

import {
  calendarDate,
  isScheduled,
  isVisible,
  visibilityModeFor,
} from "@/lib/content/visibility";

const WAT = "Africa/Lagos";

describe("visibilityModeFor", () => {
  it.each([
    [{ VERCEL_ENV: "production", NODE_ENV: "production" }, "published"],
    [{ VERCEL_ENV: "preview", NODE_ENV: "production" }, "authoring"],
    [{ NODE_ENV: "development" }, "authoring"],
    [{ NODE_ENV: "production" }, "published"],
    [{}, "published"],
  ] as const)("%j → %s", (env, mode) => {
    expect(visibilityModeFor(env)).toBe(mode);
  });
});

describe("scheduled publishing in WAT", () => {
  it("uses the Lagos calendar date, not UTC", () => {
    // 23:30 UTC on 19 Oct is 00:30 WAT on 20 Oct.
    expect(calendarDate(new Date("2026-10-19T23:30:00Z"), WAT)).toBe(
      "2026-10-20",
    );
  });

  it("publishes an item from 00:00 WAT on its date", () => {
    const date = "2026-10-20T00:00:00.000Z";
    expect(isScheduled(date, new Date("2026-10-19T22:59:00Z"), WAT)).toBe(true);
    expect(isScheduled(date, new Date("2026-10-19T23:00:00Z"), WAT)).toBe(
      false,
    );
  });
});

describe("isVisible", () => {
  const now = new Date("2026-10-17T12:00:00Z");
  const past = "2026-10-01T00:00:00.000Z";
  const future = "2026-11-01T00:00:00.000Z";

  it("hides drafts and scheduled items in published mode", () => {
    expect(isVisible({ draft: false, date: past }, "published", now, WAT)).toBe(
      true,
    );
    expect(isVisible({ draft: true, date: past }, "published", now, WAT)).toBe(
      false,
    );
    expect(
      isVisible({ draft: false, date: future }, "published", now, WAT),
    ).toBe(false);
  });

  it("shows everything in authoring mode", () => {
    expect(
      isVisible({ draft: true, date: future }, "authoring", now, WAT),
    ).toBe(true);
  });
});
