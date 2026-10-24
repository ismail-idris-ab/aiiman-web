import { Redis } from "@upstash/redis";
import { createApp, ServiceUnavailableError, type Logger } from "./app.js";
import {
  createMemoryLimiter,
  createRedisLimiter,
  type LoginLimiter,
} from "./auth/limiter.js";
import { getClient, pingDatabase } from "./db.js";
import { parseEnv } from "./env.js";
import { createMongoStores, type Stores } from "./store.js";

const env = parseEnv(process.env);

const log: Logger = (event, fields) => {
  console.error(JSON.stringify({ event, ...fields }));
};

function limiter(): LoginLimiter {
  if (
    env.UPSTASH_REDIS_REST_URL === undefined ||
    env.UPSTASH_REDIS_REST_TOKEN === undefined
  ) {
    log("api.login_limit_memory_only");
    return createMemoryLimiter();
  }
  return createRedisLimiter(
    new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    }),
  );
}

let stores: Stores | undefined;

const app = createApp({
  checkDatabase: async () => {
    if (env.MONGODB_URI === undefined) {
      log("api.database_not_configured");
      return false;
    }
    return pingDatabase(env.MONGODB_URI);
  },
  getStores: async () => {
    if (env.MONGODB_URI === undefined) {
      throw new ServiceUnavailableError("MONGODB_URI is not set");
    }
    stores ??= createMongoStores(getClient(env.MONGODB_URI).db(env.MONGODB_DB));
    return stores;
  },
  limiter: limiter(),
  log,
  now: () => new Date(),
});

export default app;
