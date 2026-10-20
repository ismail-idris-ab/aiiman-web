/**
 * Typed schema.org builders. Nodes reference each other by `@id` inside one
 * `@graph`, so the Person is described once per page.
 * No SearchAction: Google retired the sitelinks search box.
 */

import type { Entry, Page } from "#velite";

import { siteConfig } from "@/site.config";

import { absoluteUrl, canonicalUrl } from "./urls";

interface Ref {
  "@id": string;
}

export interface PersonNode extends Ref {
  "@type": "Person";
  name: string;
  url: string;
  jobTitle: string;
  description: string;
  knowsAbout: readonly string[];
  sameAs: string[];
  homeLocation: { "@type": "Place"; name: string };
}

export interface WebSiteNode extends Ref {
  "@type": "WebSite";
  name: string;
  url: string;
  description: string;
  inLanguage: string;
  publisher: Ref;
}

export interface ProfilePageNode extends Ref {
  "@type": "ProfilePage";
  url: string;
  name: string;
  description: string;
  inLanguage: string;
  dateModified?: string;
  mainEntity: Ref;
  isPartOf: Ref;
}

export interface BreadcrumbListNode {
  "@type": "BreadcrumbList";
  itemListElement: Array<{
    "@type": "ListItem";
    position: number;
    name: string;
    item: string;
  }>;
}

export interface ArticleNode extends Ref {
  "@type": "BlogPosting" | "TechArticle";
  headline: string;
  description: string;
  datePublished: string;
  dateModified: string;
  author: { "@type": "Person"; "@id": string; name: string; url: string };
  publisher: Ref;
  image: string[];
  inLanguage: string;
  mainEntityOfPage: { "@type": "WebPage"; "@id": string };
  keywords: string;
  wordCount: number;
  isPartOf: Ref;
}

export type JsonLdNode =
  PersonNode | WebSiteNode | ProfilePageNode | BreadcrumbListNode | ArticleNode;

export interface JsonLdDocument {
  "@context": "https://schema.org";
  "@graph": JsonLdNode[];
}

export interface Crumb {
  name: string;
  /** Site path, e.g. "/writing". */
  href: string;
}

const graph = (...nodes: JsonLdNode[]): JsonLdDocument => ({
  "@context": "https://schema.org",
  "@graph": nodes,
});

export const personId = (siteUrl: string) => `${siteUrl}/#person`;
export const websiteId = (siteUrl: string) => `${siteUrl}/#website`;

export function personNode(siteUrl: string): PersonNode {
  const { author, socials } = siteConfig;
  return {
    "@type": "Person",
    "@id": personId(siteUrl),
    name: author.name,
    url: absoluteUrl(siteUrl, "/about"),
    jobTitle: author.jobTitle,
    description: author.bio,
    knowsAbout: author.knowsAbout,
    sameAs: Object.values(socials).filter((url): url is string => url !== null),
    homeLocation: { "@type": "Place", name: author.location },
  };
}

export function websiteNode(siteUrl: string): WebSiteNode {
  return {
    "@type": "WebSite",
    "@id": websiteId(siteUrl),
    name: siteConfig.name,
    url: siteUrl,
    description: siteConfig.author.bio,
    inLanguage: siteConfig.lang,
    publisher: { "@id": personId(siteUrl) },
  };
}

export function breadcrumbNode(
  siteUrl: string,
  trail: readonly Crumb[],
): BreadcrumbListNode {
  return {
    "@type": "BreadcrumbList",
    itemListElement: trail.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: absoluteUrl(siteUrl, crumb.href),
    })),
  };
}

/** Home: WebSite + Person. */
export const homeJsonLd = (siteUrl: string): JsonLdDocument =>
  graph(websiteNode(siteUrl), personNode(siteUrl));

/** /about: ProfilePage whose main entity is the Person. */
export function profilePageJsonLd(siteUrl: string, page: Page): JsonLdDocument {
  const url = absoluteUrl(siteUrl, "/about");
  return graph(
    {
      "@type": "ProfilePage",
      "@id": url,
      url,
      name: page.title,
      description: page.summary,
      inLanguage: siteConfig.lang,
      ...(page.updated === undefined ? {} : { dateModified: page.updated }),
      mainEntity: { "@id": personId(siteUrl) },
      isPartOf: { "@id": websiteId(siteUrl) },
    },
    personNode(siteUrl),
    websiteNode(siteUrl),
  );
}

/** Entry: BlogPosting (TechArticle for tutorials) + BreadcrumbList (Home → Writing → Entry). */
export function entryJsonLd(
  siteUrl: string,
  entry: Entry,
  imageUrl: string,
): JsonLdDocument {
  const canonical = canonicalUrl(siteUrl, entry);
  return graph(
    {
      "@type": entry.type === "tutorial" ? "TechArticle" : "BlogPosting",
      "@id": `${absoluteUrl(siteUrl, entry.url)}#article`,
      headline: entry.title,
      description: entry.summary,
      datePublished: entry.date,
      dateModified: entry.updated ?? entry.date,
      author: {
        "@type": "Person",
        "@id": personId(siteUrl),
        name: siteConfig.author.name,
        url: absoluteUrl(siteUrl, "/about"),
      },
      publisher: { "@id": personId(siteUrl) },
      image: [imageUrl],
      inLanguage: entry.lang,
      mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
      keywords: entry.tags.join(", "),
      wordCount: entry.wordCount,
      isPartOf: { "@id": websiteId(siteUrl) },
    },
    breadcrumbNode(siteUrl, [
      { name: "Home", href: "/" },
      { name: "Writing", href: "/writing" },
      { name: entry.title, href: entry.url },
    ]),
    // Resolves the article's isPartOf reference within this page's graph.
    websiteNode(siteUrl),
  );
}

/** Tag pages: BreadcrumbList matching the visible trail. */
export const breadcrumbJsonLd = (
  siteUrl: string,
  trail: readonly Crumb[],
): JsonLdDocument => graph(breadcrumbNode(siteUrl, trail));

/** Safe for a `<script>` body: `<` is escaped so content can never close the tag. */
export const serializeJsonLd = (data: JsonLdDocument): string =>
  JSON.stringify(data).replace(/</g, "\\u003c");
