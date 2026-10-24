import {
  IMAGE_TYPES,
  isBlobImageUrl,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_SIDE,
  type ImageAttrs,
} from "@aiiman/shared";

/** What an upload returns: everything an image needs except its alt text. */
export type UploadedImage = Omit<ImageAttrs, "alt">;

export type UploadResult =
  { ok: true; image: UploadedImage } | { ok: false; error: string };

const UNSUPPORTED = "Use a JPEG, PNG or WebP image.";
const TOO_LARGE = `This image is over ${MAX_IMAGE_BYTES / 1024 / 1024} MB even after resizing. Try a smaller one.`;
const GENERIC_ERROR = "Couldn't upload the image. Check your connection.";

const isAccepted = (type: string) =>
  (IMAGE_TYPES as readonly string[]).includes(type);

/** Scales width × height down (never up) so the longer side is at most `max`. */
export function fitWithin(
  width: number,
  height: number,
  max: number,
): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * The file as the API will take it. A photo over the size limit, or in a
 * format the API refuses (HEIC from an iPhone, when the browser can decode
 * it), is re-encoded as a JPEG in the browser first, which also saves data.
 */
async function prepare(file: File): Promise<Blob | string> {
  if (isAccepted(file.type) && file.size <= MAX_IMAGE_BYTES) return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return UNSUPPORTED;
  }
  const size = fitWithin(bitmap.width, bitmap.height, MAX_IMAGE_SIDE);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (context === null) return UNSUPPORTED;
  // JPEG has no transparency: transparent pixels become white, not black.
  context.fillStyle = "#fff";
  context.fillRect(0, 0, size.width, size.height);
  context.drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.85),
  );
  if (blob === null) return UNSUPPORTED;
  return blob.size > MAX_IMAGE_BYTES ? TOO_LARGE : blob;
}

function isUploadedImage(value: unknown): value is UploadedImage {
  if (typeof value !== "object" || value === null) return false;
  const image = value as Record<string, unknown>;
  return (
    isBlobImageUrl(image.src) &&
    typeof image.width === "number" &&
    typeof image.height === "number" &&
    typeof image.blurDataURL === "string"
  );
}

/** Uploads an image file; the API measures it and makes the blur placeholder. */
export async function uploadImage(
  file: File,
  fetcher: typeof fetch = fetch,
): Promise<UploadResult> {
  const body = await prepare(file);
  if (typeof body === "string") return { ok: false, error: body };
  try {
    const res = await fetcher("/api/uploads", {
      method: "POST",
      body,
      headers: { "content-type": body.type },
      cache: "no-store",
    });
    const json = (await res.json().catch(() => null)) as {
      image?: unknown;
      error?: unknown;
    } | null;
    if (res.ok && isUploadedImage(json?.image)) {
      return { ok: true, image: json.image };
    }
    return {
      ok: false,
      error: typeof json?.error === "string" ? json.error : GENERIC_ERROR,
    };
  } catch {
    return { ok: false, error: GENERIC_ERROR };
  }
}
