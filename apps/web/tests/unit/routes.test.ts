import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { RESERVED_SLUGS } from "@/lib/content/model";

const APP = join(process.cwd(), "src/app");
const ROUTE_FILE = /^(page|route|opengraph-image|icon)\.tsx?$/;

/** Metadata files that Next serves at a top-level path, keyed by basename. */
const METADATA_ROUTES: Record<string, string> = {
  icon: "icon",
  "apple-icon": "apple-icon",
  "opengraph-image": "opengraph-image",
  sitemap: "sitemap.xml",
  robots: "robots.txt",
  manifest: "manifest.webmanifest",
};

function hasRouteFile(dir: string): boolean {
  return readdirSync(dir).some((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory()
      ? hasRouteFile(path)
      : ROUTE_FILE.test(name);
  });
}

function topLevelRoutes(): string[] {
  return readdirSync(APP).flatMap((name) => {
    const path = join(APP, name);
    if (statSync(path).isDirectory()) {
      // Dynamic segments, groups and private folders don't claim a path.
      if (/^[[(_]/.test(name) || !hasRouteFile(path)) return [];
      return [name];
    }
    const base = name.replace(/\.tsx?$/, "");
    const route = METADATA_ROUTES[base];
    return route === undefined ? [] : [route];
  });
}

describe("reserved slugs", () => {
  it("cover every top-level route in src/app", () => {
    const routes = topLevelRoutes();
    expect(routes.length).toBeGreaterThan(10);
    const reserved = new Set<string>(RESERVED_SLUGS);
    expect(routes.filter((route) => !reserved.has(route))).toEqual([]);
  });
});
