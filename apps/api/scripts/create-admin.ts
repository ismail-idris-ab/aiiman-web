/**
 * Creates the first admin user. Run from apps/api with MONGODB_URI in .env.local:
 *   pnpm create-admin
 * Prompts for name, email and password; the password is never echoed or logged.
 */
import { Writable } from "node:stream";
import { createInterface } from "node:readline/promises";
import { z } from "zod";
import {
  hashPassword,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
} from "../src/auth/password.js";
import { newUserId } from "../src/auth/routes.js";
import { getClient } from "../src/db.js";
import { parseEnv } from "../src/env.js";
import { createMongoStores, normaliseEmail } from "../src/store.js";

const env = parseEnv(process.env);
if (env.MONGODB_URI === undefined) {
  console.error("Set MONGODB_URI in apps/api/.env.local first.");
  process.exit(1);
}

let muted = false;
const output = new Writable({
  write(chunk, _encoding, callback) {
    if (!muted) process.stdout.write(chunk);
    callback();
  },
});
const rl = createInterface({ input: process.stdin, output, terminal: true });

async function askHidden(question: string): Promise<string> {
  process.stdout.write(question);
  muted = true;
  const answer = await rl.question("");
  muted = false;
  process.stdout.write("\n");
  return answer;
}

const name = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .parse(await rl.question("Name: "));
const email = normaliseEmail(
  z.email().parse((await rl.question("Email: ")).trim()),
);
const password = await askHidden(
  `Password (${MIN_PASSWORD_LENGTH}+ characters): `,
);
if (
  password.length < MIN_PASSWORD_LENGTH ||
  password.length > MAX_PASSWORD_LENGTH
) {
  console.error(
    `Password must be ${MIN_PASSWORD_LENGTH}–${MAX_PASSWORD_LENGTH} characters.`,
  );
  process.exit(1);
}
if ((await askHidden("Repeat password: ")) !== password) {
  console.error("Passwords don't match.");
  process.exit(1);
}
rl.close();

const client = getClient(env.MONGODB_URI);
const stores = createMongoStores(client.db(env.MONGODB_DB));
if ((await stores.users.findByEmail(email)) !== null) {
  console.error("A user with that email already exists.");
  await client.close();
  process.exit(1);
}
await stores.users.insert({
  id: newUserId(),
  email,
  name,
  role: "admin",
  status: "active",
  passwordHash: await hashPassword(password),
  createdAt: new Date(),
});
await client.close();
console.log(`Admin ${name} created. Log in at the admin URL.`);
