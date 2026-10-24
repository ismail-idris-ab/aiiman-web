import { MAX_IMAGE_SIDE, type ImageType } from "@aiiman/shared";
import sharp from "sharp";

/** Not a JPEG, PNG or WebP that decodes (whatever the request claimed). */
export class UnsupportedImageError extends Error {
  override name = "UnsupportedImageError";
}

export interface ProcessedImage {
  data: Buffer;
  contentType: ImageType;
  extension: string;
  width: number;
  height: number;
  blurDataURL: string;
}

const FORMATS = {
  jpeg: { contentType: "image/jpeg", extension: "jpg" },
  png: { contentType: "image/png", extension: "png" },
  webp: { contentType: "image/webp", extension: "webp" },
} as const satisfies Record<
  string,
  { contentType: ImageType; extension: string }
>;

// A 48 MP phone photo fits; larger pixel counts are refused before decoding.
const MAX_INPUT_PIXELS = 50_000_000;

// Velite's placeholder settings, so admin and MDX images blur in alike.
const BLUR_WIDTH = 8;

const isFormat = (format: unknown): format is keyof typeof FORMATS =>
  typeof format === "string" && Object.hasOwn(FORMATS, format);

/**
 * Checks the bytes (not the declared type), applies the camera's rotation,
 * scales to at most MAX_IMAGE_SIDE and re-encodes. Re-encoding also drops
 * EXIF data: phone photos carry the GPS position they were taken at.
 */
export async function processImage(input: Buffer): Promise<ProcessedImage> {
  try {
    const source = sharp(input, {
      limitInputPixels: MAX_INPUT_PIXELS,
      failOn: "error",
    });
    const { format } = await source.metadata();
    if (!isFormat(format)) throw new UnsupportedImageError();
    const scaled = source.rotate().resize({
      width: MAX_IMAGE_SIDE,
      height: MAX_IMAGE_SIDE,
      fit: "inside",
      withoutEnlargement: true,
    });
    const encoded =
      format === "jpeg"
        ? scaled.jpeg({ quality: 82, mozjpeg: true })
        : format === "png"
          ? scaled.png({ compressionLevel: 9 })
          : scaled.webp({ quality: 82 });
    const { data, info } = await encoded.toBuffer({ resolveWithObject: true });
    const blur = await sharp(data)
      .resize(
        BLUR_WIDTH,
        Math.max(1, Math.round((BLUR_WIDTH * info.height) / info.width)),
      )
      .webp({ quality: 1 })
      .toBuffer();
    return {
      data,
      ...FORMATS[format],
      width: info.width,
      height: info.height,
      blurDataURL: `data:image/webp;base64,${blur.toString("base64")}`,
    };
  } catch (error) {
    // sharp throws plain Errors for corrupt, truncated or oversized input.
    if (error instanceof UnsupportedImageError) throw error;
    throw new UnsupportedImageError("image could not be decoded", {
      cause: error,
    });
  }
}
