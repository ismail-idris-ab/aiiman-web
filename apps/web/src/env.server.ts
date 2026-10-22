import "server-only";

import { parseServerEnv } from "@/lib/env-schema";

/** Server-only env, validated once when first imported. Never import from a client component. */
export const serverEnv = parseServerEnv(process.env);

export const isProductionDeploy = serverEnv.VERCEL_ENV === "production";
