// Local tracer check: in-memory MongoDB + the real API on :3001 with one admin user.
// Run from apps/api: pnpm exec tsx <this file>
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient } from "mongodb";

const mongod = await MongoMemoryServer.create();
process.env.MONGODB_URI = mongod.getUri();
process.env.MONGODB_DB = "tracer";
process.env.SITE_URL = "http://localhost:3100";
process.env.SITE_API_SECRET = "local-tracer-secret-0123456789abcdef";

const cwd = process.cwd().replaceAll("\\", "/");
const { hashPassword } = await import(`file:///${cwd}/src/auth/password.ts`);
const client = await MongoClient.connect(mongod.getUri());
await client
  .db("tracer")
  .collection("users")
  .insertOne({
    _id: "admin-1",
    email: "admin@example.com",
    name: "Local Admin",
    role: "admin",
    status: "active",
    passwordHash: await hashPassword("local tracer password"),
    createdAt: new Date(),
  } as never);

const { default: app } = await import(`file:///${cwd}/src/index.ts`);
app.listen(3001, () => console.log("API_READY"));
