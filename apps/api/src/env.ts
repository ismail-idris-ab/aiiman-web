import { z } from "zod";

const envSchema = z.object({
  MONGODB_URI: z
    .string()
    .regex(
      /^mongodb(\+srv)?:\/\//,
      "must be a mongodb:// or mongodb+srv:// URI",
    )
    .optional(),
});

export type Env = z.infer<typeof envSchema>;

/** Validates server env. Empty strings count as unset, matching Vercel's blank values. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const cleaned = Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== ""),
  );
  return envSchema.parse(cleaned);
}
