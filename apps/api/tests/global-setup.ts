import { MongoBinary } from "mongodb-memory-server";

/**
 * Fetches the MongoDB test binary once, before test files start in parallel.
 * On a cold cache every file would otherwise download it at the same time and
 * race on the lock file (seen in CI after a lockfile change).
 */
export default async function setup(): Promise<void> {
  await MongoBinary.getPath();
}
