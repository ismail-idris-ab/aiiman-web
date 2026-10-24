import { z } from "zod";

type EnvSource = Record<string, string | undefined>;

/** Hosts (Vercel included) often set unused variables to "". Treat that as unset. */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess(
    (value) => (value === "" ? undefined : value),
    schema.optional(),
  );

export const clientEnvSchema = z.object({
  NEXT_PUBLIC_SITE_URL: optional(z.url({ protocol: /^https?$/ })),
});

export const serverEnvSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    VERCEL_ENV: optional(z.enum(["production", "preview", "development"])),
    // Set by Vercel at build and run time; keys the content fetch cache per deploy.
    VERCEL_DEPLOYMENT_ID: optional(z.string().trim().min(1)),
    BUTTONDOWN_API_KEY: optional(z.string().trim().min(1)),
    UPSTASH_REDIS_REST_URL: optional(z.url({ protocol: /^https$/ })),
    UPSTASH_REDIS_REST_TOKEN: optional(z.string().trim().min(1)),
    GOOGLE_SITE_VERIFICATION: optional(z.string().trim().min(1)),
    BING_SITE_VERIFICATION: optional(z.string().trim().min(1)),
    // The admin API whose published posts previews show (ignored in production until switch-over).
    CONTENT_API_URL: optional(z.url({ protocol: /^https?$/ })),
    // Shared with the API: authenticates /api/revalidate and draft-preview links.
    SITE_API_SECRET: optional(z.string().trim().min(32)),
  })
  .refine(
    (env) =>
      (env.UPSTASH_REDIS_REST_URL === undefined) ===
      (env.UPSTASH_REDIS_REST_TOKEN === undefined),
    {
      message:
        "Set both UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN, or neither.",
      path: ["UPSTASH_REDIS_REST_URL"],
    },
  );

export type ClientEnv = z.infer<typeof clientEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

function parseOrThrow<T extends z.ZodType>(
  schema: T,
  source: EnvSource,
  label: string,
): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    throw new Error(
      `Invalid ${label} environment variables:\n${z.prettifyError(result.error)}`,
    );
  }
  return result.data;
}

export const parseClientEnv = (source: EnvSource): ClientEnv =>
  parseOrThrow(clientEnvSchema, source, "client");

export const parseServerEnv = (source: EnvSource): ServerEnv =>
  parseOrThrow(serverEnvSchema, source, "server");
