import type { Redis } from "@upstash/redis";

export const MAX_FAILURES = 5;
export const LOCK_SECONDS = 15 * 60;

/**
 * Counts failed logins per key (an IP or an account). A key is locked once it
 * reaches MAX_FAILURES within LOCK_SECONDS of its first failure.
 */
export interface LoginLimiter {
  isLocked(key: string): Promise<boolean>;
  recordFailure(key: string): Promise<void>;
  reset(key: string): Promise<void>;
}

/** Per-instance fallback for local dev and when Upstash isn't configured. */
export function createMemoryLimiter(
  now: () => number = Date.now,
): LoginLimiter {
  const entries = new Map<string, { count: number; expiresAt: number }>();

  function current(key: string) {
    const entry = entries.get(key);
    if (entry !== undefined && entry.expiresAt <= now()) {
      entries.delete(key);
      return undefined;
    }
    return entry;
  }

  return {
    async isLocked(key) {
      return (current(key)?.count ?? 0) >= MAX_FAILURES;
    },
    async recordFailure(key) {
      const entry = current(key);
      if (entry === undefined) {
        entries.set(key, { count: 1, expiresAt: now() + LOCK_SECONDS * 1000 });
      } else {
        entry.count += 1;
      }
    },
    async reset(key) {
      entries.delete(key);
    },
  };
}

/** Shared across every instance, so the limit holds however many are running. */
export function createRedisLimiter(redis: Redis): LoginLimiter {
  const redisKey = (key: string) => `login-failures:${key}`;
  return {
    async isLocked(key) {
      const count = await redis.get<number>(redisKey(key));
      return (count ?? 0) >= MAX_FAILURES;
    },
    async recordFailure(key) {
      const count = await redis.incr(redisKey(key));
      if (count === 1) await redis.expire(redisKey(key), LOCK_SECONDS);
    },
    async reset(key) {
      await redis.del(redisKey(key));
    },
  };
}
