import { describe, expect, it } from "vitest";
import { embedCaption } from "../src/embed-node";

describe("embedCaption", () => {
  it("names the embed and shows its link", () => {
    expect(
      embedCaption("https://x.com/vercel/status/1790123456789012345", null),
    ).toBe(
      "Post by @vercel on X · https://x.com/vercel/status/1790123456789012345",
    );
    expect(
      embedCaption("https://www.youtube.com/watch?v=dQw4w9WgXcQ", "A talk"),
    ).toBe("A talk · https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  });
});
