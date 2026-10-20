/**
 * Fails if any server-only secret value or provider hostname appears in what
 * browsers can fetch: client assets (`.next/static`), prerendered HTML/RSC
 * payloads (`.next/server/app`) and `public/`. Run after `next build`.
 * Prints variable names only, never values.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Directories served to browsers; for prerendered output only the payload files count (not server code or source maps). */
const SCAN_TARGETS: ReadonlyArray<{ dir: string; match?: RegExp }> = [
  { dir: ".next/static" },
  { dir: ".next/server/app", match: /.(html|rsc|body|meta)$/ },
  { dir: "public" },
];
const SECRET_KEYS = [
  "BUTTONDOWN_API_KEY",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
] as const;
const FORBIDDEN_STRINGS = ["api.buttondown", "upstash.io"];

// Same files Next reads for a production build; real deploys pass env vars directly.
for (const file of [
  ".env.production.local",
  ".env.local",
  ".env.production",
  ".env",
]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

function* files(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else yield path;
  }
}

const needles = [
  ...SECRET_KEYS.flatMap((key) => {
    const value = process.env[key]?.trim();
    return value ? [{ label: `value of ${key}`, text: value }] : [];
  }),
  ...FORBIDDEN_STRINGS.map((text) => ({ label: `"${text}"`, text })),
];

const findings: string[] = [];
let scanned = 0;
for (const { dir, match } of SCAN_TARGETS) {
  if (!existsSync(dir)) continue;
  for (const file of files(dir)) {
    if (match !== undefined && !match.test(file)) continue;
    scanned += 1;
    const body = readFileSync(file, "utf8");
    for (const { label, text } of needles) {
      if (body.includes(text)) findings.push(`${label} found in ${file}`);
    }
  }
}

if (findings.length > 0) {
  console.error(
    `Browser-served output leak check failed:\n${findings.join("\n")}`,
  );
  process.exit(1);
}
console.log(
  `Browser-served output leak check passed: ${scanned} files, ${needles.length} needles (${needles.length - FORBIDDEN_STRINGS.length} env values).`,
);
