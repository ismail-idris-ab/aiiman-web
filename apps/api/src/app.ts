import express, {
  type ErrorRequestHandler,
  type Express,
  type RequestHandler,
} from "express";
import { authRouter } from "./auth/routes.js";
import { requireSameOrigin } from "./http/origin.js";
import { postsRouter, type PostDeps } from "./posts/routes.js";
import { previewRouter, publicRouter } from "./public/routes.js";

export type Logger = (event: string, fields?: Record<string, unknown>) => void;

/** Thrown when a dependency (the database) isn't configured or reachable. */
export class ServiceUnavailableError extends Error {
  override name = "ServiceUnavailableError";
}

export interface AppDeps extends PostDeps {
  /** SITE_API_SECRET: the site authenticates draft-preview reads with it. */
  siteSecret: string | undefined;
  /** Resolves true when the database answers a ping. */
  checkDatabase: () => Promise<boolean>;
}

const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ error: "Not found" });
};

export function createApp(deps: AppDeps): Express {
  const { checkDatabase, log } = deps;
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));
  app.use("/api", requireSameOrigin);

  app.get("/api/health", async (_req, res) => {
    const database = await checkDatabase().catch((error: unknown) => {
      log("api.health_check_failed", { error: errorName(error) });
      return false;
    });
    res
      .status(database ? 200 : 503)
      .set("Cache-Control", "no-store")
      .json({ api: "ok", database: database ? "ok" : "down" });
  });

  app.use("/api/auth", authRouter(deps));
  app.use("/api/posts", postsRouter(deps));
  app.use("/api/public", publicRouter(deps));
  app.use("/api/preview", previewRouter({ ...deps, secret: deps.siteSecret }));

  app.use(notFound);

  const onError: ErrorRequestHandler = (error: unknown, _req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof ServiceUnavailableError) {
      res.status(503).json({ error: "Service unavailable. Try again soon." });
      return;
    }
    // Malformed JSON bodies from express.json().
    if (isClientError(error)) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }
    log("api.unhandled_error", { error: errorName(error) });
    res.status(500).json({ error: "Something went wrong" });
  };
  app.use(onError);

  return app;
}

/** Error class name only: messages can carry connection strings or user data. */
export function errorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

function isClientError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" && status >= 400 && status < 500;
}
