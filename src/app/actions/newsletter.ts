"use server";

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { headers } from "next/headers";

import { serverEnv } from "@/env.server";
import {
  addButtondownSubscriber,
  clientIp,
  subscribe,
  type SubscribeDeps,
  type SubscribeState,
} from "@/lib/newsletter/subscribe";
import { createMemoryRateLimit } from "@/lib/newsletter/memory-rate-limit";

/** Sign-up attempts per IP per window: Upstash sliding window, or the in-memory fallback. */
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 10 * 60 * 1000;

/** Structured, email-free server log line. */
const log: SubscribeDeps["log"] = (event, detail) => {
  console.info(JSON.stringify({ event, ...detail }));
};

const ratelimit =
  serverEnv.UPSTASH_REDIS_REST_URL !== undefined &&
  serverEnv.UPSTASH_REDIS_REST_TOKEN !== undefined
    ? new Ratelimit({
        redis: new Redis({
          url: serverEnv.UPSTASH_REDIS_REST_URL,
          token: serverEnv.UPSTASH_REDIS_REST_TOKEN,
        }),
        limiter: Ratelimit.slidingWindow(RATE_LIMIT, "10 m"),
        prefix: "aiiman:newsletter",
        // If Upstash is slow or down, fall back to the in-memory limiter below.
        timeout: 2000,
      })
    : null;

// Always on: without Upstash (or while it's failing) each instance still limits per IP.
const memoryRateLimit = createMemoryRateLimit({
  limit: RATE_LIMIT,
  windowMs: RATE_WINDOW_MS,
  now: Date.now,
});

if (ratelimit === null) log("newsletter.rate_limit_memory_only");

async function rateLimit(id: string): Promise<boolean> {
  if (ratelimit === null) return memoryRateLimit(id);
  try {
    const result = await ratelimit.limit(id);
    if (result.reason !== "timeout") return result.success;
    log("newsletter.rate_limit_timeout");
  } catch (error) {
    log("newsletter.rate_limit_error", {
      error: error instanceof Error ? error.name : "unknown",
    });
  }
  return memoryRateLimit(id);
}

export async function subscribeAction(
  _previous: SubscribeState,
  formData: FormData,
): Promise<SubscribeState> {
  const apiKey = serverEnv.BUTTONDOWN_API_KEY;
  if (apiKey === undefined) {
    return {
      status: "error",
      message: "The newsletter isn't open yet. Follow the RSS feed instead.",
    };
  }

  const ip = clientIp(await headers());
  return subscribe(formData, ip, {
    rateLimit,
    addSubscriber: (email, subscriberIp) =>
      addButtondownSubscriber(email, subscriberIp, { apiKey, fetch, log }),
    log,
    now: Date.now,
  });
}
