import express, {
  type ErrorRequestHandler,
  type Express,
  type RequestHandler,
} from "express";

export type Logger = (event: string, fields?: Record<string, unknown>) => void;

export interface AppDeps {
  /** Resolves true when the database answers a ping. */
  checkDatabase: () => Promise<boolean>;
  log: Logger;
}

const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ error: "Not found" });
};

export function createApp({ checkDatabase, log }: AppDeps): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "100kb" }));

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

  app.use(notFound);

  const onError: ErrorRequestHandler = (error: unknown, _req, res, next) => {
    if (res.headersSent) return next(error);
    log("api.unhandled_error", { error: errorName(error) });
    res.status(500).json({ error: "Something went wrong" });
  };
  app.use(onError);

  return app;
}

/** Error class name only: messages can carry connection strings or user data. */
function errorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}
