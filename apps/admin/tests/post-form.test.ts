import { postInputSchema, textToDoc } from "@aiiman/shared";
import { describe, expect, it } from "vitest";
import { EMPTY_FIELDS, fieldsOf, inputOf, parseTags } from "../src/post-form";
import { previewPost, type Post } from "../src/posts";

const post: Post = {
  id: "p1",
  title: "A post from the admin",
  slug: "a-post",
  summary: "A summary long enough to pass the fifty character minimum.",
  body: textToDoc("One.\n\nTwo."),
  type: "tutorial",
  tags: ["web", "nigeria"],
  lang: "ha",
  date: "2026-10-22",
  featured: 4,
  noindex: true,
  cover: {
    src: "https://abc123.public.blob.vercel-storage.com/images/cover.webp",
    alt: "Kano city walls at dusk",
    width: 1600,
    height: 900,
    blurDataURL: "data:image/webp;base64,UklGRkAAAABXRUJQ",
  },
  status: "draft",
  authorId: "u1",
  updatedAt: "2026-10-22T09:00:00.000Z",
  publishedAt: null,
};

describe("parseTags", () => {
  it("splits on commas, trims and lowercases", () => {
    expect(parseTags(" Web, react-native ,,Nigeria ")).toEqual([
      "web",
      "react-native",
      "nigeria",
    ]);
    expect(parseTags("")).toEqual([]);
  });
});

describe("fieldsOf / inputOf", () => {
  it("round-trips a post's fields", () => {
    const { id, status, authorId, updatedAt, publishedAt, ...fields } = post;
    expect(inputOf(fieldsOf(post))).toEqual(fields);
  });

  it("leaves empty optional fields out, so saving clears them", () => {
    const input = inputOf({
      ...EMPTY_FIELDS,
      date: " ",
      featured: "",
      canonical: "",
      cover: null,
    });
    for (const key of ["date", "updated", "featured", "canonical", "cover"]) {
      expect(input).not.toHaveProperty(key);
    }
  });

  it("produces input the shared schema accepts", () => {
    const input = inputOf(fieldsOf(post));
    expect(postInputSchema.safeParse(input).success).toBe(true);
  });
});

describe("previewPost", () => {
  const previews = {
    search: {
      title: "A post · Aiiman",
      description: "Summary",
      url: "https://site.example/a-post",
      indexed: true,
    },
    shareImageUrl: "/api/posts/p1/share-image?v=1",
    readerUrl: "https://site.example/api/draft?token=t",
  };

  it("returns the site's previews", async () => {
    const fetcher = (async () => Response.json(previews)) as typeof fetch;
    expect(await previewPost("p1", fetcher)).toEqual({ ok: true, previews });
  });

  it("passes the API's message through when the site is unavailable", async () => {
    const fetcher = (async () =>
      Response.json(
        { error: "Previews need the site connection." },
        { status: 503 },
      )) as typeof fetch;
    expect(await previewPost("p1", fetcher)).toEqual({
      ok: false,
      error: "Previews need the site connection.",
    });
  });
});
