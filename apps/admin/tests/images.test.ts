import { MAX_IMAGE_BYTES } from "@aiiman/shared";
import { describe, expect, it, vi } from "vitest";
import { fitWithin, uploadImage } from "../src/images";

const uploaded = {
  src: "https://abc123.public.blob.vercel-storage.com/images/a.png",
  width: 640,
  height: 480,
  blurDataURL: "data:image/webp;base64,UklGRkAAAABXRUJQ",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("fitWithin", () => {
  it("scales the longer side down to the limit", () => {
    expect(fitWithin(4000, 3000, 2400)).toEqual({ width: 2400, height: 1800 });
    expect(fitWithin(1000, 5000, 2400)).toEqual({ width: 480, height: 2400 });
  });

  it("never scales up", () => {
    expect(fitWithin(640, 480, 2400)).toEqual({ width: 640, height: 480 });
  });
});

describe("uploadImage", () => {
  it("sends an accepted file as the raw body with its type", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "a.png", {
      type: "image/png",
    });
    const fetcher = vi.fn(async () => json(201, { image: uploaded }));
    expect(await uploadImage(file, fetcher)).toEqual({
      ok: true,
      image: uploaded,
    });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/uploads",
      expect.objectContaining({
        method: "POST",
        body: file,
        headers: { "content-type": "image/png" },
      }),
    );
  });

  it("passes the API's message through", async () => {
    const file = new File([new Uint8Array([1])], "a.png", {
      type: "image/png",
    });
    const fetcher = vi.fn(async () =>
      json(503, { error: "Image uploads aren't set up yet." }),
    );
    expect(await uploadImage(file, fetcher)).toEqual({
      ok: false,
      error: "Image uploads aren't set up yet.",
    });
  });

  it("refuses an answer that isn't a Blob image", async () => {
    const file = new File([new Uint8Array([1])], "a.png", {
      type: "image/png",
    });
    const fetcher = vi.fn(async () =>
      json(201, { image: { ...uploaded, src: "https://evil.example/a.png" } }),
    );
    expect((await uploadImage(file, fetcher)).ok).toBe(false);
  });

  it("reports a network failure", async () => {
    const file = new File([new Uint8Array([1])], "a.png", {
      type: "image/png",
    });
    const fetcher = vi.fn(async () => {
      throw new TypeError("offline");
    });
    expect(await uploadImage(file, fetcher)).toEqual({
      ok: false,
      error: "Couldn't upload the image. Check your connection.",
    });
  });

  it("doesn't upload a file it can't decode or shrink", async () => {
    // Over the limit, and createImageBitmap can't read it (there is none here).
    const file = new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], "a.heic", {
      type: "image/heic",
    });
    const fetcher = vi.fn();
    expect(await uploadImage(file, fetcher)).toEqual({
      ok: false,
      error: "Use a JPEG, PNG or WebP image.",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
