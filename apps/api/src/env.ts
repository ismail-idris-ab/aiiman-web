import { z } from "zod";

const envSchema = z
  .object({
    MONGODB_URI: z
      .string()
      .regex(
        /^mongodb(\+srv)?:\/\//,
        "must be a mongodb:// or mongodb+srv:// URI",
      )
      .optional(),
    MONGODB_DB: z.string().min(1).default("aiiman"),
    UPSTASH_REDIS_REST_URL: z.url().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
    SITE_URL: z.url().optional(),
    SITE_API_SECRET: z
      .string()
      .min(32, "SITE_API_SECRET must be at least 32 characters")
      .optional(),
    SITE_PROTECTION_BYPASS: z.string().min(1).optional(),
  })
  .refine(
    (env) =>
      (env.UPSTASH_REDIS_REST_URL === undefined) ===
      (env.UPSTASH_REDIS_REST_TOKEN === undefined),
    "set both UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN, or neither",
  )
  .refine(
    (env) =>
      (env.SITE_URL === undefined) === (env.SITE_API_SECRET === undefined),
    "set both SITE_URL and SITE_API_SECRET, or neither",
  );

export type Env = z.infer<typeof envSchema>;

/** Validates server env. Empty strings count as unset, matching Vercel's blank values. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const cleaned = Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== ""),
  );
  return envSchema.parse(cleaned);
}
