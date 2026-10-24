import { put } from "@vercel/blob";

/** Where uploaded images are kept. Vercel Blob in production; a fake in tests. */
export interface ImageStore {
  /** Stores a new public file at `pathname` and resolves to its URL. */
  put(pathname: string, data: Buffer, contentType: string): Promise<string>;
}

// Pathnames are random UUIDs, so a stored file never changes: cache for a year.
const ONE_YEAR = 365 * 24 * 60 * 60;

/** The Blob store for BLOB_READ_WRITE_TOKEN, or undefined when it isn't set. */
export function createBlobStore(
  token: string | undefined,
): ImageStore | undefined {
  if (token === undefined) return undefined;
  return {
    async put(pathname, data, contentType) {
      const blob = await put(pathname, data, {
        access: "public",
        contentType,
        token,
        addRandomSuffix: false,
        cacheControlMaxAge: ONE_YEAR,
      });
      return blob.url;
    },
  };
}
