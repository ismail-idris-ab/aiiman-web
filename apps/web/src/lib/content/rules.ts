/**
 * Build-time content rules. Pure functions so they can be unit-tested
 * without running Velite.
 */

import { RESERVED_SLUGS, SLUG_PATTERN, type Lang } from "./model";

/** Minimal mdast shape: enough to walk the tree without pulling in unist types. */
export interface MdNode {
  type: string;
  depth?: number;
  url?: string;
  alt?: string | null;
  name?: string | null;
  attributes?: ReadonlyArray<{ type: string; name?: string; value?: unknown }>;
  children?: MdNode[];
}

/** Removes MDX comments (`{/* … *\/}`), which hold author-only review notes. */
export function stripMdxComments(text: string): string {
  return text
    .replace(/[ \t]*\{\/\*[\s\S]*?\*\/\}[ \t]*\r?\n?/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function walk(node: MdNode, visit: (node: MdNode) => void): void {
  visit(node);
  for (const child of node.children ?? []) walk(child, visit);
}

/** Body-level problems: an h1 (the page title is the only h1) or an image without alt text. */
export function findBodyIssues(tree: MdNode): string[] {
  const issues: string[] = [];
  walk(tree, (node) => {
    if (node.type === "heading" && node.depth === 1) {
      issues.push(
        "body contains an h1 (`# `); the title is the page's only h1 — start at `##`",
      );
    }
    if (node.type === "image" && (node.alt ?? "").trim() === "") {
      issues.push(`image "${node.url ?? ""}" has no alt text`);
    }
    if (
      (node.type === "mdxJsxFlowElement" ||
        node.type === "mdxJsxTextElement") &&
      (node.name === "img" || node.name === "Image")
    ) {
      const alt = node.attributes?.find(
        (a) => a.type === "mdxJsxAttribute" && a.name === "alt",
      );
      if (alt === undefined || typeof alt.value !== "string") {
        issues.push(`<${node.name}> has no string alt attribute`);
      }
    }
  });
  return issues;
}

export interface RuleEntry {
  slug: string;
  source: string;
  lang: Lang;
  featured?: number | undefined;
  translationOf?: string | undefined;
  redirectFrom: readonly string[];
}

export interface RuleLink {
  slug: string;
  source: string;
  featured?: number | undefined;
}

const reserved = new Set<string>(RESERVED_SLUGS);

/** Cross-file rules. Returns one message per problem, each naming the offending file. */
export function findCollectionIssues(
  entries: readonly RuleEntry[],
  links: readonly RuleLink[],
): string[] {
  const issues: string[] = [];
  const all = [...entries, ...links];

  const bySlug = new Map<string, string[]>();
  for (const item of all) {
    if (!SLUG_PATTERN.test(item.slug)) {
      issues.push(
        `${item.source}: slug "${item.slug}" must be lowercase kebab-case (a-z, 0-9, -)`,
      );
    }
    if (reserved.has(item.slug)) {
      issues.push(
        `${item.source}: slug "${item.slug}" collides with a reserved route`,
      );
    }
    bySlug.set(item.slug, [...(bySlug.get(item.slug) ?? []), item.source]);
  }
  for (const [slug, sources] of bySlug) {
    if (sources.length > 1)
      issues.push(`duplicate slug "${slug}" in: ${sources.join(", ")}`);
  }

  const byFeatured = new Map<number, string[]>();
  for (const item of all) {
    if (item.featured === undefined) continue;
    byFeatured.set(item.featured, [
      ...(byFeatured.get(item.featured) ?? []),
      item.source,
    ]);
  }
  for (const [position, sources] of byFeatured) {
    if (sources.length > 1) {
      issues.push(
        `featured: ${position} is used more than once: ${sources.join(", ")}`,
      );
    }
  }

  const entryBySlug = new Map(entries.map((e) => [e.slug, e]));
  const translated = new Map<string, string>();
  for (const entry of entries) {
    if (entry.translationOf === undefined) continue;
    const original = entryBySlug.get(entry.translationOf);
    if (entry.lang === "en") {
      issues.push(
        `${entry.source}: only the Hausa version carries translationOf; remove it from the English entry`,
      );
    } else if (original === undefined) {
      issues.push(
        `${entry.source}: translationOf "${entry.translationOf}" does not match any entry`,
      );
    } else if (original.lang === entry.lang) {
      issues.push(
        `${entry.source}: translationOf "${entry.translationOf}" has the same lang (${entry.lang})`,
      );
    } else if (original.translationOf !== undefined) {
      issues.push(
        `${entry.source}: translationOf must point at an original, not another translation`,
      );
    }
    const previous = translated.get(entry.translationOf);
    if (previous !== undefined) {
      issues.push(
        `${entry.source}: "${entry.translationOf}" already has a translation in ${previous}`,
      );
    } else {
      translated.set(entry.translationOf, entry.source);
    }
  }

  const redirectOwner = new Map<string, string>();
  for (const entry of entries) {
    for (const old of entry.redirectFrom) {
      if (bySlug.has(old) || reserved.has(old)) {
        issues.push(
          `${entry.source}: redirectFrom "${old}" is a live slug or reserved route`,
        );
      }
      const owner = redirectOwner.get(old);
      if (owner !== undefined) {
        issues.push(
          `${entry.source}: redirectFrom "${old}" is already claimed by ${owner}`,
        );
      } else {
        redirectOwner.set(old, entry.source);
      }
    }
  }

  return issues;
}

/** Pages every published page links to (nav, footer, bylines, Person JSON-LD, newsletter consent). */
export const REQUIRED_PAGES = ["about", "privacy"] as const;

export interface RulePage {
  slug: string;
  draft: boolean;
}

/** Publishing an Item while a required page is still a draft would ship sitewide links to a 404. */
export function findRequiredPageIssues(
  items: ReadonlyArray<{ draft: boolean }>,
  pages: readonly RulePage[],
): string[] {
  if (items.every((item) => item.draft)) return [];
  return REQUIRED_PAGES.filter(
    (slug) => !pages.some((page) => page.slug === slug && !page.draft),
  ).map(
    (slug) =>
      `content/pages/${slug}.mdx must be published (draft: false) before any Entry or Link: every page links to /${slug}`,
  );
}
