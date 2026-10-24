import { createApp, type Logger } from "./app.js";
import { pingDatabase } from "./db.js";
import { parseEnv } from "./env.js";

const env = parseEnv(process.env);

const log: Logger = (event, fields) => {
  console.error(JSON.stringify({ event, ...fields }));
};

const app = createApp({
  checkDatabase: async () => {
    if (env.MONGODB_URI === undefined) {
      log("api.database_not_configured");
      return false;
    }
    return pingDatabase(env.MONGODB_URI);
  },
  log,
});

export default app;
