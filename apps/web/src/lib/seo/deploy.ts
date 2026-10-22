/** Dependency-free so next.config.ts can import it. */

/** Whether this deploy may be indexed: everything except non-production Vercel environments. */
export const isIndexableDeploy = (vercelEnv: string | undefined): boolean =>
  vercelEnv === undefined || vercelEnv === "production";
