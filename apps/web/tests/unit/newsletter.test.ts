import { describe, expect, it, vi } from "vitest";

import {
  addButtondownSubscriber,
  BUTTONDOWN_ENDPOINT,
  botSignal,
  clientIp,
  emailSchema,
  FIELD,
  MESSAGES,
  MIN_SUBMIT_MS,
  subscribe,
  type SubscribeDeps,
} from "@/lib/newsletter/subscribe";

const NOW = 1_800_000_000_000;

function form(fields: Partial<Record<keyof typeof FIELD, string>>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    data.set(FIELD[key as keyof typeof FIELD], value);
  }
  return data;
}

function deps(overrides: Partial<SubscribeDeps> = {}) {
  const log = vi.fn<SubscribeDeps["log"]>();
  const addSubscriber = vi.fn<SubscribeDeps["addSubscriber"]>(
    async () => "created",
  );
  return {
    log,
    addSubscriber,
    deps: { log, addSubscriber, now: () => NOW, ...overrides },
  };
}

const human = (email: string) =>
  form({ email, startedAt: String(NOW - MIN_SUBMIT_MS - 1) });

describe("emailSchema", () => {
  it("trims and lowercases", () => {
    expect(emailSchema.parse("  Ismail@Example.COM ")).toBe(
      "ismail@example.com",
    );
  });

  it("rejects malformed and over-long addresses", () => {
    expect(emailSchema.safeParse("not-an-email").success).toBe(false);
    expect(emailSchema.safeParse("").success).toBe(false);
    expect(emailSchema.safeParse(`${"a".repeat(250)}@x.io`).success).toBe(
      false,
    );
  });
});

describe("subscribe", () => {
  it("subscribes a valid email (normalised) and returns the generic success", async () => {
    const t = deps();
    const result = await subscribe(
      human(" Reader@Example.com "),
      "203.0.113.5",
      t.deps,
    );
    expect(result).toEqual({ status: "success", message: MESSAGES.success });
    expect(t.addSubscriber).toHaveBeenCalledWith(
      "reader@example.com",
      "203.0.113.5",
    );
  });

  it("rejects an invalid email without calling the provider", async () => {
    const t = deps();
    const result = await subscribe(human("nope@"), null, t.deps);
    expect(result.status).toBe("invalid");
    expect(result.message).toBe(MESSAGES.invalid);
    expect(t.addSubscriber).not.toHaveBeenCalled();
  });

  it("treats a filled honeypot as a bot: fake success, no provider call", async () => {
    const t = deps();
    const data = human("bot@example.com");
    data.set(FIELD.honeypot, "https://spam.example");
    const result = await subscribe(data, null, t.deps);
    expect(result.status).toBe("success");
    expect(t.addSubscriber).not.toHaveBeenCalled();
    expect(t.log).toHaveBeenCalledWith("newsletter.bot", {
      signal: "honeypot",
    });
  });

  it("treats a too-fast submission as a bot", async () => {
    const t = deps();
    const data = form({
      email: "fast@example.com",
      startedAt: String(NOW - 500),
    });
    expect((await subscribe(data, null, t.deps)).status).toBe("success");
    expect(t.addSubscriber).not.toHaveBeenCalled();
  });

  it("accepts a submission with no timestamp (no-JS form post)", async () => {
    const t = deps();
    await subscribe(form({ email: "nojs@example.com" }), null, t.deps);
    expect(t.addSubscriber).toHaveBeenCalledOnce();
  });

  it("returns rate_limited when the limiter refuses (mocked)", async () => {
    const rateLimit = vi.fn(async () => false);
    const t = deps({ rateLimit });
    const result = await subscribe(
      human("a@example.com"),
      "198.51.100.7",
      t.deps,
    );
    expect(result).toEqual({
      status: "rate_limited",
      message: MESSAGES.rate_limited,
    });
    expect(rateLimit).toHaveBeenCalledWith("198.51.100.7");
    expect(t.addSubscriber).not.toHaveBeenCalled();
  });

  it("allows the request when the limiter passes (mocked)", async () => {
    const t = deps({ rateLimit: async () => true });
    expect((await subscribe(human("a@example.com"), null, t.deps)).status).toBe(
      "success",
    );
    expect(t.addSubscriber).toHaveBeenCalledOnce();
  });

  it("hides whether the address already exists", async () => {
    const t = deps({ addSubscriber: async () => "rejected" });
    expect(
      (await subscribe(human("dup@example.com"), null, t.deps)).status,
    ).toBe("success");
  });

  it("returns the generic error when the provider fails", async () => {
    const t = deps({ addSubscriber: async () => "failed" });
    expect(await subscribe(human("a@example.com"), null, t.deps)).toEqual({
      status: "error",
      message: MESSAGES.error,
    });
  });

  it("never logs the email address", async () => {
    const t = deps({ rateLimit: async () => false });
    await subscribe(human("secret-person@example.com"), null, t.deps);
    const bot = human("secret-person@example.com");
    bot.set(FIELD.honeypot, "x");
    await subscribe(bot, null, t.deps);
    expect(JSON.stringify(t.log.mock.calls)).not.toContain("secret-person");
  });
});

describe("botSignal", () => {
  it("ignores whitespace-only honeypot values and garbage timestamps", () => {
    expect(botSignal(form({ honeypot: "  ", startedAt: "abc" }), NOW)).toBe(
      null,
    );
  });
});

describe("addButtondownSubscriber", () => {
  const response = (status: number) =>
    new Response(status === 201 ? "{}" : '{"detail":"x"}', { status });

  it("posts to the documented endpoint with a token header and timeout", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => response(201));
    const log = vi.fn();
    const result = await addButtondownSubscriber(
      "a@example.com",
      "203.0.113.5",
      {
        apiKey: "test-key",
        fetch: fetchMock,
        log,
      },
    );
    expect(result).toBe("created");
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(BUTTONDOWN_ENDPOINT);
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      "Token test-key",
    );
    expect(JSON.parse(String(init?.body))).toEqual({
      email_address: "a@example.com",
      ip_address: "203.0.113.5",
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("maps 400 to rejected, other errors to failed, and logs status only", async () => {
    const log = vi.fn();
    const call = (status: number) =>
      addButtondownSubscriber("who@example.com", null, {
        apiKey: "k",
        fetch: async () => response(status),
        log,
      });
    expect(await call(400)).toBe("rejected");
    expect(await call(500)).toBe("failed");
    expect(await call(401)).toBe("failed");
    expect(log).toHaveBeenCalledWith("newsletter.provider_status", {
      status: 500,
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain("who@");
  });

  it("returns failed on network errors and timeouts", async () => {
    const log = vi.fn();
    const result = await addButtondownSubscriber("a@example.com", null, {
      apiKey: "k",
      fetch: async () => {
        throw new DOMException("timed out", "TimeoutError");
      },
      log,
    });
    expect(result).toBe("failed");
    expect(log).toHaveBeenCalledWith("newsletter.provider_error", {
      error: "TimeoutError",
    });
  });
});

describe("clientIp", () => {
  it("takes the first x-forwarded-for address, then x-real-ip", () => {
    expect(
      clientIp(new Headers({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" })),
    ).toBe("203.0.113.5");
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.2" }))).toBe(
      "198.51.100.2",
    );
    expect(clientIp(new Headers())).toBe(null);
  });
});
