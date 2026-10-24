import { describe, expect, it } from "vitest";
import { docToMarkdown, docToText, normaliseDoc } from "../src/doc.js";
import {
  EMBED_FRAME_ORIGINS,
  embedFrameSrc,
  embedLabel,
  embedUrl,
  resolveEmbed,
  UNSUPPORTED_EMBED,
  type Embed,
} from "../src/embed.js";

const embedOf = (url: string): Embed => {
  const result = resolveEmbed(url);
  if (!result.ok) throw new Error(`${url}: ${result.error}`);
  return result.embed;
};

const errorOf = (url: string): string => {
  const result = resolveEmbed(url);
  if (result.ok) throw new Error(`${url} resolved`);
  return result.error;
};

describe("resolveEmbed", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s", "dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ?si=abc", "dQw4w9WgXcQ"],
    ["https://m.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/live/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
  ])("YouTube: %s", (url, id) => {
    expect(embedOf(url)).toEqual({ provider: "youtube", id });
  });

  it.each([
    "https://x.com/vercel/status/1790123456789012345",
    "https://twitter.com/vercel/status/1790123456789012345?s=20",
    "https://mobile.twitter.com/vercel/status/1790123456789012345/photo/1",
    "http://www.x.com/vercel/status/1790123456789012345",
  ])("X: %s", (url) => {
    expect(embedOf(url)).toEqual({
      provider: "x",
      user: "vercel",
      id: "1790123456789012345",
    });
  });

  it.each([
    "https://www.tiktok.com/@scout2015/video/6718335390845095173",
    "https://tiktok.com/@scout2015/video/6718335390845095173?lang=en",
    "https://m.tiktok.com/@scout2015/video/6718335390845095173",
  ])("TikTok: %s", (url) => {
    expect(embedOf(url)).toEqual({
      provider: "tiktok",
      user: "scout2015",
      id: "6718335390845095173",
    });
  });

  it.each([
    ["https://www.instagram.com/p/C0mX8jYsxyz/", "p"],
    ["https://instagram.com/p/C0mX8jYsxyz/?igsh=abc", "p"],
    ["https://www.instagram.com/tv/C0mX8jYsxyz", "p"],
    ["https://www.instagram.com/reel/C0mX8jYsxyz/", "reel"],
    ["https://www.instagram.com/reels/C0mX8jYsxyz/", "reel"],
    ["https://www.instagram.com/someone/p/C0mX8jYsxyz/", "p"],
  ])("Instagram: %s", (url, kind) => {
    expect(embedOf(url)).toEqual({
      provider: "instagram",
      kind,
      id: "C0mX8jYsxyz",
    });
  });

  it.each([
    "https://gist.github.com/octocat/6cad326836d38bd3a7ae",
    "https://gist.github.com/octocat/6CAD326836D38BD3A7AE",
    "https://gist.github.com/octocat/6cad326836d38bd3a7ae.js",
    "https://gist.github.com/octocat/6cad326836d38bd3a7ae#file-hello-md",
  ])("Gist: %s", (url) => {
    expect(embedOf(url)).toEqual({
      provider: "gist",
      user: "octocat",
      id: "6cad326836d38bd3a7ae",
    });
  });

  it.each([
    "https://vimeo.com/123456",
    "https://example.com/watch?v=dQw4w9WgXcQ",
    "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ",
    "https://evil.example/x.com/vercel/status/1",
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "ftp://gist.github.com/octocat/6cad326836d38bd3a7ae",
    "https://user:pass@x.com/vercel/status/1",
    "https://github.com/octocat/hello-world",
  ])("rejects other sites: %s", (url) => {
    expect(errorOf(url)).toBe(UNSUPPORTED_EMBED);
  });

  it.each([
    ["https://www.youtube.com/watch?v=short", /YouTube link/],
    ["https://www.youtube.com/@channel", /YouTube link/],
    ["https://youtu.be/", /YouTube link/],
    ["https://x.com/vercel", /X link/],
    ["https://x.com/i/web/status/1790123456789012345", /X link/],
    ["https://x.com/vercel/status/notanumber", /X link/],
    ["https://www.tiktok.com/@scout2015", /TikTok link/],
    ["https://vm.tiktok.com/ZMabc123/", /Short TikTok links/],
    ["https://www.instagram.com/someone/", /Instagram link/],
    ["https://www.instagram.com/p/a/", /Instagram link/],
    ["https://gist.github.com/octocat", /gist/],
    ["https://gist.github.com/octocat/not-hex", /gist/],
  ])("explains a wrong link on a supported site: %s", (url, message) => {
    expect(errorOf(url)).toMatch(message);
  });

  it("asks for a link when given none or text", () => {
    expect(errorOf("  ")).toMatch(/Paste the link/);
    expect(errorOf("two words")).toMatch(/Paste the link/);
  });
});

describe("embed URLs", () => {
  const embeds: Embed[] = [
    { provider: "youtube", id: "dQw4w9WgXcQ" },
    { provider: "x", user: "vercel", id: "1790123456789012345" },
    { provider: "tiktok", user: "scout2015", id: "6718335390845095173" },
    { provider: "instagram", kind: "reel", id: "C0mX8jYsxyz" },
    { provider: "gist", user: "octocat", id: "6cad326836d38bd3a7ae" },
  ];

  it.each(embeds)(
    "$provider frames load only from the allowlisted origins",
    (embed) => {
      expect(EMBED_FRAME_ORIGINS).toContain(
        new URL(embedFrameSrc(embed)).origin,
      );
    },
  );

  it.each(embeds)(
    "$provider canonical URL resolves back to itself",
    (embed) => {
      expect(embedOf(embedUrl(embed))).toEqual(embed);
    },
  );

  it("labels embeds by provider and author", () => {
    expect(embeds.map(embedLabel)).toEqual([
      "YouTube video",
      "Post by @vercel on X",
      "TikTok video by @scout2015",
      "Instagram reel",
      "GitHub Gist by octocat",
    ]);
  });
});

describe("embed nodes", () => {
  const doc = (...content: unknown[]) => ({ type: "doc", content });

  it("stores the canonical URL and a trimmed title", () => {
    expect(
      normaliseDoc(
        doc({
          type: "embed",
          attrs: {
            url: "youtu.be/dQw4w9WgXcQ?si=tracking",
            title: " Talk ",
            html: "<x>",
          },
        }),
      ),
    ).toEqual(
      doc({
        type: "embed",
        attrs: {
          url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          title: "Talk",
        },
      }),
    );
  });

  it("drops embeds of unsupported or malformed links", () => {
    expect(
      normaliseDoc(
        doc(
          { type: "embed", attrs: { url: "https://evil.example/" } },
          { type: "embed", attrs: { url: 42 } },
          { type: "embed" },
        ),
      ),
    ).toEqual(doc());
  });

  it("exports a link to Markdown and adds no plain text", () => {
    const body = normaliseDoc(
      doc({
        type: "embed",
        attrs: { url: "https://x.com/vercel/status/1790123456789012345" },
      }),
    );
    expect(docToMarkdown(body)).toBe(
      "[Post by @vercel on X](<https://x.com/vercel/status/1790123456789012345>)",
    );
    expect(docToText(body)).toBe("");
  });
});
