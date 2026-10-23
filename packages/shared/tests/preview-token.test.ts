import { describe, expect, it } from "vitest";
import {
  createPreviewToken,
  PREVIEW_TOKEN_SECONDS,
  verifyPreviewToken,
} from "../src/preview-token.js";

const SECRET = "s".repeat(32);
const now = new Date("2026-10-22T09:00:00Z");

describe("preview tokens", () => {
  it("round-trips the post id and expiry", () => {
    const token = createPreviewToken("post-1", SECRET, now);
    expect(verifyPreviewToken(token, SECRET, now)).toEqual({
      postId: "post-1",
      expires: new Date(now.getTime() + PREVIEW_TOKEN_SECONDS * 1000),
    });
  });

  it("expires", () => {
    const token = createPreviewToken("post-1", SECRET, now);
    const later = new Date(now.getTime() + PREVIEW_TOKEN_SECONDS * 1000);
    expect(verifyPreviewToken(token, SECRET, later)).toBeNull();
  });

  it("rejects another secret, a swapped post id and a stretched expiry", () => {
    const token = createPreviewToken("post-1", SECRET, now);
    const [, expires, signature] = token.split(".");
    expect(verifyPreviewToken(token, "t".repeat(32), now)).toBeNull();
    expect(
      verifyPreviewToken(`post-2.${expires}.${signature}`, SECRET, now),
    ).toBeNull();
    expect(
      verifyPreviewToken(
        `post-1.${Number(expires) + 3600}.${signature}`,
        SECRET,
        now,
      ),
    ).toBeNull();
  });

  it.each(["", "a", "a.b", "a.123", "a.123.sig.extra", ".123.sig", "a.x.sig"])(
    "rejects malformed token %j",
    (token) => {
      expect(verifyPreviewToken(token, SECRET, now)).toBeNull();
    },
  );
});
