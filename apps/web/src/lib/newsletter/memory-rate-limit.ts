/**
 * Fixed-window rate limiter held in process memory. The newsletter action
 * uses it when Upstash isn't configured, times out or errors, so sign-ups are
 * never unlimited. Per instance only: weaker than Upstash across many
 * instances, but it bounds a single client hammering one warm function.
 */

export interface MemoryRateLimitOptions {
  limit: number;
  windowMs: number;
  now: () => number;
  /** Cap on tracked keys so a flood of distinct IPs can't grow memory without bound. */
  maxKeys?: number;
}

export function createMemoryRateLimit({
  limit,
  windowMs,
  now,
  maxKeys = 10_000,
}: MemoryRateLimitOptions): (key: string) => boolean {
  const windows = new Map<string, { start: number; count: number }>();

  function prune(time: number) {
    for (const [key, window] of windows) {
      if (time - window.start >= windowMs) windows.delete(key);
    }
    // Still full of live windows: drop the oldest (Map keeps insertion order).
    for (const key of windows.keys()) {
      if (windows.size < maxKeys) break;
      windows.delete(key);
    }
  }

  return (key) => {
    const time = now();
    const window = windows.get(key);
    if (window === undefined || time - window.start >= windowMs) {
      if (window === undefined && windows.size >= maxKeys) prune(time);
      windows.set(key, { start: time, count: 1 });
      return true;
    }
    if (window.count >= limit) return false;
    window.count += 1;
    return true;
  };
}
