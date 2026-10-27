import {
  MAX_IMAGE_BYTES,
  MAX_IMAGE_SIDE,
  publicPostSchema,
  textToDoc,
} from "@aiiman/shared";
import { MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { hashToken } from "../src/auth/tokens.js";
import { SESSION_COOKIE } from "../src/http/cookies.js";
import {
  createMongoStores,
  resetIndexCacheForTests,
  type Stores,
} from "../src/store.js";
import type { ImageStore } from "../src/uploads/blob.js";
import { request, testDeps } from "./helpers.js";

let mongod: MongoMemoryServer;
let client: MongoClient;
let stores: Stores;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  client = await MongoClient.connect(mongod.getUri());
}, 300_000);

afterAll(async () => {
  await client?.close();
  await mongod?.stop();
});

const COOKIE = `${SESSION_COOKIE}=token-author`;

beforeEach(async () => {
  resetIndexCacheForTests();
  stores = createMongoStores(client.db(`test-${crypto.randomUUID()}`));
  await stores.users.insert({
    id: "author",
    email: "author@example.com",
    name: "Author",
    role: "author",
    status: "active",
    passwordHash: "unused",
    createdAt: new Date(),
  });
  await stores.sessions.insert({
    tokenHash: hashToken("token-author"),
    userId: "author",
    createdAt: new Date(),
    expiresAt: new Date("2100-01-01T00:00:00Z"),
  });
});

/** An in-memory Blob store that answers with Blob-shaped URLs. */
function fakeStore() {
  const files = new Map<string, { data: Buffer; contentType: string }>();
  const store: ImageStore = {
    async put(pathname, data, contentType) {
      files.set(pathname, { data, contentType });
      return `https://teststore.public.blob.vercel-storage.com/${pathname}`;
    },
  };
  return { store, files };
}

function app(images: ImageStore | undefined) {
  return createApp(testDeps({ getStores: async () => stores, images }));
}

const png = (width: number, height: number) =>
  sharp({
    create: { width, height, channels: 3, background: "#2e3d8f" },
  })
    .png()
    .toBuffer();

const upload = (
  a: ReturnType<typeof app>,
  data: Uint8Array,
  type = "image/png",
  cookie: string | null = COOKIE,
) =>
  request(a, "/api/uploads", {
    method: "POST",
    binary: { data, type },
    ...(cookie === null ? {} : { cookie }),
  });

interface Uploaded {
  image: { src: string; width: number; height: number; blurDataURL: string };
}

describe("POST /api/uploads", () => {
  it("requires a session", async () => {
    const res = await upload(
      app(fakeStore().store),
      await png(10, 10),
      "image/png",
      null,
    );
    expect(res.status).toBe(401);
  });

  it("refuses cross-site uploads", async () => {
    const res = await request(app(fakeStore().store), "/api/uploads", {
      method: "POST",
      binary: { data: await png(10, 10), type: "image/png" },
      cookie: COOKIE,
      origin: "https://evil.example",
    });
    expect(res.status).toBe(403);
  });

  it("explains when no Blob store is connected", async () => {
    const res = await upload(app(undefined), await png(10, 10));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      error: expect.stringMatching(/BLOB_READ_WRITE_TOKEN/),
    });
  });

  it("stores a scaled copy and returns its measurements", async () => {
    const { store, files } = fakeStore();
    const res = await upload(app(store), await png(3000, 1500));
    expect(res.status).toBe(201);
    const { image } = (await res.json()) as Uploaded;
    expect(image).toEqual({
      src: expect.stringMatching(
        /^https:\/\/teststore\.public\.blob\.vercel-storage\.com\/images\/[0-9a-f-]{36}\.png$/,
      ),
      width: MAX_IMAGE_SIDE,
      height: MAX_IMAGE_SIDE / 2,
      blurDataURL: expect.stringMatching(/^data:image\/webp;base64,/),
    });
    const [stored] = [...files.values()];
    expect(stored?.contentType).toBe("image/png");
    const meta = await sharp(stored?.data).metadata();
    expect([meta.width, meta.height]).toEqual([MAX_IMAGE_SIDE, 1200]);
    const [record] = await stores.uploads.findByUrls([image.src]);
    const { src, ...measurements } = image;
    expect(record).toMatchObject({
      ...measurements,
      url: src,
      contentType: "image/png",
      uploadedBy: "author",
    });
  });

  it("keeps small images at their size", async () => {
    const res = await upload(app(fakeStore().store), await png(640, 480));
    const { image } = (await res.json()) as Uploaded;
    expect([image.width, image.height]).toEqual([640, 480]);
  });

  it("applies the camera rotation and strips EXIF (GPS) data", async () => {
    const { store, files } = fakeStore();
    const photo = await sharp({
      create: { width: 400, height: 200, channels: 3, background: "#888" },
    })
      .jpeg()
      .withMetadata({
        orientation: 6,
        exif: {
          IFD0: { Make: "Phone" },
          IFD3: { GPSLatitudeRef: "N", GPSLatitude: "12/1 0/1 0/1" },
        },
      })
      .toBuffer();
    const before = await sharp(photo).metadata();
    expect(before.orientation).toBe(6);
    expect(before.exif?.toString("latin1")).toContain("Phone");
    const res = await upload(app(store), photo, "image/jpeg");
    expect(res.status).toBe(201);
    const { image } = (await res.json()) as Uploaded;
    // Orientation 6 is a quarter turn: a landscape sensor image shown upright.
    expect([image.width, image.height]).toEqual([200, 400]);
    const meta = await sharp([...files.values()][0]?.data).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
  });

  it("judges the bytes, not the declared type", async () => {
    const gif = await sharp({
      create: { width: 4, height: 4, channels: 3, background: "#000" },
    })
      .gif()
      .toBuffer();
    const a = app(fakeStore().store);
    for (const [data, type] of [
      [Buffer.from("<svg onload=alert(1)>"), "image/png"],
      [gif, "image/png"],
      [Buffer.from("not an image"), "image/jpeg"],
      [await png(10, 10), "text/plain"],
      [await png(10, 10), "image/svg+xml"],
    ] as const) {
      const res = await upload(a, data, type);
      expect(res.status, type).toBe(415);
      expect(await res.json()).toEqual({
        error: "Upload a JPEG, PNG or WebP image.",
      });
    }
  });

  it("refuses files over the size limit", async () => {
    const res = await upload(
      app(fakeStore().store),
      new Uint8Array(MAX_IMAGE_BYTES + 1),
    );
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "Images can be at most 4 MB." });
  });
});

describe("images in posts", () => {
  const post = (overrides: Record<string, unknown>) => ({
    title: "A post with pictures",
    summary:
      "A summary long enough to pass the fifty character minimum for posts.",
    slug: "a-post-with-pictures",
    type: "essay",
    tags: ["web"],
    lang: "en",
    noindex: false,
    body: textToDoc("Words."),
    ...overrides,
  });
  const body = (...images: unknown[]) => ({
    type: "doc",
    content: images.map((attrs) => ({ type: "image", attrs })),
  });

  async function setup() {
    const a = app(fakeStore().store);
    const res = await upload(a, await png(800, 600));
    const { image } = (await res.json()) as Uploaded;
    const save = (overrides: Record<string, unknown>) =>
      request(a, "/api/posts", {
        method: "POST",
        body: post(overrides),
        cookie: COOKIE,
      });
    return { image, save };
  }

  const fieldsOf = async (res: Response) =>
    ((await res.json()) as { fields: Record<string, string> }).fields;

  it("saves uploaded images and a cover", async () => {
    const { image, save } = await setup();
    const res = await save({
      body: body({ ...image, alt: "A blue square" }),
      cover: { ...image, alt: "The same blue square" },
    });
    expect(res.status).toBe(201);
    const saved = (await res.json()) as { post: { cover: unknown } };
    expect(saved.post.cover).toEqual({ ...image, alt: "The same blue square" });
  });

  it("serves the cover to the site once published", async () => {
    const { image, save } = await setup();
    const cover = { ...image, alt: "A blue square" };
    const res = await save({ cover });
    const { post: saved } = (await res.json()) as { post: { id: string } };
    const stored = await stores.posts.findById(saved.id);
    if (stored === null) throw new Error("post not saved");
    await stores.posts.update(saved.id, {
      status: "published",
      date: "2026-10-24",
      publishedAt: new Date(),
      updatedAt: new Date(),
    });
    const publicRes = await request(
      app(undefined),
      "/api/public/posts/a-post-with-pictures",
    );
    const body = (await publicRes.json()) as { post: unknown };
    expect(publicPostSchema.parse(body.post).cover).toEqual(cover);
  });

  it("requires alt text on images and the cover", async () => {
    const { image, save } = await setup();
    const res = await save({
      body: body({ ...image, alt: "" }),
      cover: { ...image, alt: "  " },
    });
    // Saved as a draft, but named as what to fix before publishing.
    expect(res.status).toBe(201);
    const { issues } = (await res.json()) as {
      issues: Record<string, string>;
    };
    expect(issues.body).toMatch(/Add alt text to image 1/);
    expect(issues["cover.alt"]).toMatch(/Add alt text/);
  });

  it("refuses images that weren't uploaded here", async () => {
    const { image, save } = await setup();
    const elsewhere = {
      ...image,
      src: "https://otherstore.public.blob.vercel-storage.com/images/x.png",
      alt: "Someone else's image",
    };
    const res = await save({ body: body(elsewhere), cover: elsewhere });
    expect(res.status).toBe(400);
    expect(await fieldsOf(res)).toEqual({
      body: "This image wasn't uploaded here. Upload it again.",
      cover: "This image wasn't uploaded here. Upload it again.",
    });
  });

  it("refuses measurements that differ from the upload", async () => {
    const { image, save } = await setup();
    const res = await save({
      body: body({ ...image, alt: "Stretched", height: image.height * 3 }),
    });
    expect(res.status).toBe(400);
    expect(Object.keys(await fieldsOf(res))).toEqual(["body"]);
  });

  it("drops foreign image URLs from the body before checking", async () => {
    const { save } = await setup();
    const res = await save({
      body: body({
        src: "https://example.com/tracker.png",
        alt: "Tracker",
        width: 1,
        height: 1,
        blurDataURL: "data:image/png;base64,AAAA",
      }),
    });
    expect(res.status).toBe(201);
    const saved = (await res.json()) as { post: { body: unknown } };
    expect(saved.post.body).toEqual({ type: "doc", content: [] });
  });
});
