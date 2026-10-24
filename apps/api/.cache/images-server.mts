// Local #10 check: in-memory MongoDB + the real API on :3001, with a fake Blob
// store whose files are served from :3199 (Playwright maps the Blob host there).
// Run from apps/api: pnpm exec tsx .cache/images-server.mts
import { createServer } from "node:http";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient } from "mongodb";

const cwd = process.cwd().replaceAll("\\", "/");
const load = (path: string) => import(`file:///${cwd}/${path}`);

const mongod = await MongoMemoryServer.create();
const client = await MongoClient.connect(mongod.getUri());
const db = client.db("tracer");

const { hashPassword } = await load("src/auth/password.ts");
await db.collection("users").insertOne({
  _id: "admin-1",
  email: "admin@example.com",
  name: "Local Admin",
  role: "admin",
  status: "active",
  passwordHash: await hashPassword("local tracer password"),
  createdAt: new Date(),
} as never);

const files = new Map<string, { data: Buffer; contentType: string }>();
createServer((req, res) => {
  const file = files.get((req.url ?? "").slice(1));
  if (file === undefined) return void res.writeHead(404).end();
  res.writeHead(200, { "content-type": file.contentType }).end(file.data);
}).listen(3199);

const { createApp } = await load("src/app.ts");
const { createMemoryLimiter } = await load("src/auth/limiter.ts");
const { createSiteClient } = await load("src/site.ts");
const { createMongoStores } = await load("src/store.ts");
const log = (event: string, fields?: object) =>
  console.error(JSON.stringify({ event, ...fields }));
const stores = createMongoStores(db);

const app = createApp({
  checkDatabase: async () => true,
  getStores: async () => stores,
  images: {
    async put(pathname: string, data: Buffer, contentType: string) {
      files.set(pathname, { data, contentType });
      console.error(JSON.stringify({ event: "fake_blob.put", pathname, bytes: data.length }));
      return `https://localtest.public.blob.vercel-storage.com/${pathname}`;
    },
  },
  limiter: createMemoryLimiter(),
  log,
  siteSecret: "local-tracer-secret-0123456789abcdef",
  site: createSiteClient({
    url: "http://localhost:3100",
    secret: "local-tracer-secret-0123456789abcdef",
    protectionBypass: undefined,
    log,
    now: () => new Date(),
  }),
  now: () => new Date(),
});
app.listen(3001, () => console.log("API_READY"));
