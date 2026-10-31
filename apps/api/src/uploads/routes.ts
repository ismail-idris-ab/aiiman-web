import { randomUUID } from "node:crypto";
import {
  IMAGE_TYPES,
  isBlobImageUrl,
  MAX_IMAGE_BYTES,
  type ImageAttrs,
} from "@aiiman/shared";
import express, {
  Router,
  type ErrorRequestHandler,
  type RequestHandler,
} from "express";
import { requireUser, type AuthDeps } from "../auth/routes.js";
import { allow } from "../auth/policy.js";
import type { User } from "../store.js";
import type { ImageStore } from "./blob.js";
import { processImage, UnsupportedImageError } from "./images.js";

export interface UploadDeps extends AuthDeps {
  /** Undefined until a Vercel Blob store is connected. */
  images: ImageStore | undefined;
}

const NOT_CONFIGURED =
  "Image uploads aren't set up yet. Connect a Vercel Blob store (BLOB_READ_WRITE_TOKEN).";
const UNSUPPORTED = "Upload a JPEG, PNG or WebP image.";
const TOO_LARGE = `Images can be at most ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`;

/**
 * POST /api/uploads with the image as the raw body. Any signed-in writer can
 * upload; posts may only use images uploaded here (checked on save).
 */
export function uploadsRouter(deps: UploadDeps): Router {
  const { getStores, images, log } = deps;
  const router = Router();

  const requireStore: RequestHandler = (_req, res, next) => {
    if (images === undefined) {
      res.status(503).json({ error: NOT_CONFIGURED });
      return;
    }
    next();
  };

  // Answers before the body is read: sign-in and configuration come first.
  router.post(
    "/",
    requireUser(deps),
    allow("upload.create"),
    requireStore,
    express.raw({ type: [...IMAGE_TYPES], limit: MAX_IMAGE_BYTES }),
    async (req, res) => {
      const body: unknown = req.body;
      // express.raw leaves any other content type unparsed.
      if (!Buffer.isBuffer(body) || body.length === 0 || images === undefined) {
        res.status(415).json({ error: UNSUPPORTED });
        return;
      }
      let image;
      try {
        image = await processImage(body);
      } catch (error) {
        if (!(error instanceof UnsupportedImageError)) throw error;
        res.status(415).json({ error: UNSUPPORTED });
        return;
      }
      const url = await images.put(
        `images/${randomUUID()}.${image.extension}`,
        image.data,
        image.contentType,
      );
      // Posts accept only Blob URLs; a store answering otherwise is misconfigured.
      if (!isBlobImageUrl(url)) throw new Error("unexpected Blob URL");
      const user = res.locals.user as User;
      const stores = await getStores();
      await stores.uploads.insert({
        url,
        width: image.width,
        height: image.height,
        blurDataURL: image.blurDataURL,
        contentType: image.contentType,
        bytes: image.data.length,
        uploadedBy: user.id,
        createdAt: deps.now(),
      });
      log("uploads.created", { userId: user.id, bytes: image.data.length });
      const attrs: Omit<ImageAttrs, "alt"> = {
        src: url,
        width: image.width,
        height: image.height,
        blurDataURL: image.blurDataURL,
      };
      res.status(201).json({ image: attrs });
    },
  );

  const tooLarge: ErrorRequestHandler = (error: unknown, _req, res, next) => {
    if (
      typeof error === "object" &&
      error !== null &&
      (error as { type?: unknown }).type === "entity.too.large"
    ) {
      res.status(413).json({ error: TOO_LARGE });
      return;
    }
    next(error);
  };
  router.use(tooLarge);

  return router;
}
