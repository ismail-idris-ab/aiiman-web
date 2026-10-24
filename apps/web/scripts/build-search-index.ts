/**
 * Builds the MiniSearch index from Velite output → public/search-index.json.
 * Runs after `velite build` and before `next build`. In `next dev`, the Velite
 * `complete` hook rebuilds it on every content change instead.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import type { Entry, Link } from "../.velite";
import { visibilityModeFor } from "../src/lib/content/visibility";
import { buildSearchIndex } from "../src/lib/search-index";
import { siteConfig } from "../src/site.config";

const root = resolve(import.meta.dirname, "..");
const readJson = <T>(file: string): T =>
  JSON.parse(readFileSync(resolve(root, ".velite", file), "utf8")) as T;

const mode = visibilityModeFor(process.env);
const { json, count } = buildSearchIndex(
  {
    entries: readJson<Entry[]>("entries.json"),
    links: readJson<Link[]>("links.json"),
  },
  { mode, now: new Date(), timeZone: siteConfig.timeZone },
);

writeFileSync(resolve(root, "public/search-index.json"), json);
console.log(
  `[search-index] ${count} items (${mode}) → public/search-index.json`,
);
