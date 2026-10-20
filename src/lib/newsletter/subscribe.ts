/**
 * Newsletter sign-up logic, free of Next/env bindings so it can be unit-tested.
 * `src/app/actions/newsletter.ts` injects the real rate limiter, Buttondown
 * client and logger.
 *
 * Rules: generic messages only; never reveal whether an address is already
 * subscribed; bots get the same success response as people; logs never
 * contain the email address.
 */

import { z } from "zod";

import { FIELD, type SubscribeState, type SubscribeStatus } from "./fields";

export { FIELD, initialSubscribeState } from "./fields";
export type { SubscribeState, SubscribeStatus } from "./fields";

/** Submissions faster than this after the form loaded are treated as bots. */
export const MIN_SUBMIT_MS = 3000;

export const BUTTONDOWN_ENDPOINT = "https://api.buttondown.com/v1/subscribers";
export const BUTTONDOWN_TIMEOUT_MS = 8000;

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email());

export const MESSAGES = {
  success:
    "Thanks. Check your inbox for a confirmation email to finish subscribing.",
  invalid: "Enter a valid email address, like name@example.com.",
  rate_limited: "Too many attempts. Wait a few minutes and try again.",
  error: "Subscribing didn't work this time. Try again later.",
} as const satisfies Record<Exclude<SubscribeStatus, "idle">, string>;

const state = (status: Exclude<SubscribeStatus, "idle">): SubscribeState => ({
  status,
  message: MESSAGES[status],
});

export type BotSignal = "honeypot" | "too_fast";

/** A missing timestamp is allowed: the form also works without JavaScript, where it can't be set. */
export function botSignal(formData: FormData, now: number): BotSignal | null {
  const honeypot = formData.get(FIELD.honeypot);
  if (typeof honeypot === "string" && honeypot.trim() !== "") {
    return "honeypot";
  }
  const startedAt = Number(formData.get(FIELD.startedAt));
  if (Number.isFinite(startedAt) && startedAt > 0) {
    if (now - startedAt < MIN_SUBMIT_MS) return "too_fast";
  }
  return null;
}

export type ButtondownResult = "created" | "rejected" | "failed";

export interface SubscribeDeps {
  /** Returns false when the caller is over the limit. Absent when rate limiting isn't configured. */
  rateLimit?: (ip: string) => Promise<boolean>;
  addSubscriber: (
    email: string,
    ip: string | null,
  ) => Promise<ButtondownResult>;
  /** Must never receive an email address. */
  log: (event: string, detail?: Record<string, string | number>) => void;
  now: () => number;
}

export async function subscribe(
  formData: FormData,
  ip: string | null,
  deps: SubscribeDeps,
): Promise<SubscribeState> {
  const bot = botSignal(formData, deps.now());
  if (bot !== null) {
    deps.log("newsletter.bot", { signal: bot });
    return state("success");
  }

  const parsed = emailSchema.safeParse(formData.get(FIELD.email) ?? "");
  if (!parsed.success) return state("invalid");

  if (
    deps.rateLimit !== undefined &&
    !(await deps.rateLimit(ip ?? "unknown"))
  ) {
    deps.log("newsletter.rate_limited");
    return state("rate_limited");
  }

  const result = await deps.addSubscriber(parsed.data, ip);
  if (result === "failed") return state("error");
  // "rejected" (e.g. already subscribed) looks identical to success on purpose.
  return state("success");
}

export interface ButtondownDeps {
  apiKey: string;
  fetch: typeof fetch;
  log: SubscribeDeps["log"];
}

/** Buttondown's create-subscriber call (docs.buttondown.com/api-subscribers-create). Double opt-in stays on. */
export async function addButtondownSubscriber(
  email: string,
  ip: string | null,
  { apiKey, fetch: fetchImpl, log }: ButtondownDeps,
): Promise<ButtondownResult> {
  try {
    const response = await fetchImpl(BUTTONDOWN_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email_address: email,
        ...(ip === null ? {} : { ip_address: ip }),
      }),
      signal: AbortSignal.timeout(BUTTONDOWN_TIMEOUT_MS),
      cache: "no-store",
    });
    if (response.ok) return "created";
    log("newsletter.provider_status", { status: response.status });
    // 400 covers duplicates and suppressed addresses: report success to the reader.
    return response.status === 400 ? "rejected" : "failed";
  } catch (error) {
    log("newsletter.provider_error", {
      error: error instanceof Error ? error.name : "unknown",
    });
    return "failed";
  }
}

/** First address in Vercel's `x-forwarded-for` (set by Vercel's edge, not the client), else `x-real-ip`. */
export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  const real = headers.get("x-real-ip")?.trim();
  return real ? real : null;
}
