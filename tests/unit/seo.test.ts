import { XMLParser, XMLValidator } from "fast-xml-parser";
import { describe, expect, it } from "vitest";

import { createContentQueries, type QueryOptions } from "@/lib/content/queries";
import { isIndexableDeploy } from "@/lib/seo/deploy";
import {
  buildEntryMarkdown,
  buildLlmsTxt,
  buildRobots,
  buildSecurityTxt,
  buildSitemap,
} from "@/lib/seo/discovery";
import {
  buildJsonFeed,
  buildRss,
  escapeXml,
  type JsonFeed,
} from "@/lib/seo/feeds";
import {
  entryJsonLd,
  homeJsonLd,
  profilePageJsonLd,
  serializeJsonLd,
  type ArticleNode,
  type BreadcrumbListNode,
  type JsonLdDocument,
} from "@/lib/seo/jsonld";
import { entryMetadata, pageMetadata } from "@/lib/seo/metadata";
import { siteConfig } from "@/site.config";
import { entryOgImagePath, isIndexableEntry } from "@/lib/seo/urls";

import { entry, link, page } from "./fixtures";

const SITE = "https://example.test";
const published: QueryOptions = {
  mode: "published",
  now: new Date("2026-10-17T12:00:00Z"),
  timeZone: "Africa/Lagos",
};

const english = entry("english-post", {
  title: "An English post with <angle> & ampersand",
  date: "2026-09-01T00:00:00.000Z",
  updated: "2026-09-10T00:00:00.000Z",
  tags: ["react", "web"],
  raw: "## Heading\n\nBody text.\n",
  wordCount: 420,
});
const hausa = entry("hausa-post", {
  date: "2026-09-02T00:00:00.000Z",
  lang: "ha",
  translationOf: "english-post",
  tags: ["react"],
});
const tutorial = entry("a-tutorial", {
  type: "tutorial",
  date: "2026-08-01T00:00:00.000Z",
  tags: ["react", "rare"],
});
const hidden = entry("hidden-post", { noindex: true, tags: ["web"] });
const crossPosted = entry("cross-posted", {
  canonical: "https://elsewhere.test/original",
  tags: ["web"],
});
const selfCanonical = entry("self-canonical", {
  canonical: `${SITE}/self-canonical`,
});
const draft = entry("draft-post", { draft: true, tags: ["react"] });
const video = link("a-video", {
  date: "2026-09-05T00:00:00.000Z",
  tags: ["react"],
});

const content = createContentQueries(
  {
    entries: [
      english,
      hausa,
      tutorial,
      hidden,
      crossPosted,
      selfCanonical,
      draft,
    ],
    links: [video],
    projects: [],
    pages: [
      page("about", { title: "About", updated: "2026-07-01T00:00:00.000Z" }),
      page("uses", { title: "Uses" }),
      page("privacy", { title: "Privacy", draft: true }),
    ],
  },
  published,
);

const parser = new XMLParser({ ignoreAttributes: false });
const nodeOfType = <T>(doc: JsonLdDocument, type: string): T => {
  const node = doc["@graph"].find((candidate) => candidate["@type"] === type);
  if (node === undefined) throw new Error(`no ${type} node`);
  return node as T;
};

describe("isIndexableEntry", () => {
  it("excludes noindex and off-site canonicals, keeps self-canonicals", () => {
    expect(isIndexableEntry(SITE, english)).toBe(true);
    expect(isIndexableEntry(SITE, hidden)).toBe(false);
    expect(isIndexableEntry(SITE, crossPosted)).toBe(false);
    expect(isIndexableEntry(SITE, selfCanonical)).toBe(true);
  });
});

describe("isIndexableDeploy", () => {
  it("indexes production and local builds only", () => {
    expect(isIndexableDeploy("production")).toBe(true);
    expect(isIndexableDeploy(undefined)).toBe(true);
    expect(isIndexableDeploy("preview")).toBe(false);
    expect(isIndexableDeploy("development")).toBe(false);
  });
});

describe("pageMetadata", () => {
  it("sets a self canonical, feeds, OG and Twitter on every page", () => {
    const meta = pageMetadata({
      title: "Writing",
      description: "Every post.",
      path: "/writing",
    });
    expect(meta.alternates?.canonical).toBe("/writing");
    expect(Object.keys(meta.alternates?.types ?? {})).toEqual([
      "application/rss+xml",
      "application/feed+json",
    ]);
    expect(meta.openGraph).toMatchObject({ url: "/writing", type: "website" });
    expect(meta.twitter).toMatchObject({ card: "summary_large_image" });
    expect(meta.robots).toBeUndefined();
  });

  it("supports absolute titles and noindex, follow", () => {
    const meta = pageMetadata({
      title: "Home",
      description: "Home page.",
      path: "/",
      absoluteTitle: true,
      noindex: true,
    });
    expect(meta.title).toEqual({ absolute: "Home" });
    expect(meta.robots).toEqual({ index: false, follow: true });
  });
});

describe("entryMetadata", () => {
  it("emits article OG fields and hreflang for a translated pair", () => {
    const meta = entryMetadata(SITE, english, hausa);
    expect(meta.openGraph).toMatchObject({
      type: "article",
      publishedTime: english.date,
      modifiedTime: english.updated,
      authors: [`${SITE}/about`],
      tags: ["react", "web"],
      locale: "en_GB",
    });
    expect(meta.alternates?.languages).toEqual({
      en: "/english-post",
      ha: "/hausa-post",
      "x-default": "/english-post",
    });
    expect(entryMetadata(SITE, hausa, english).alternates?.languages).toEqual(
      meta.alternates?.languages,
    );
  });

  it("omits hreflang without a pair and respects canonical and noindex", () => {
    expect(entryMetadata(SITE, tutorial, undefined).alternates?.languages).toBe(
      undefined,
    );
    expect(
      entryMetadata(SITE, crossPosted, undefined).alternates?.canonical,
    ).toBe("https://elsewhere.test/original");
    expect(entryMetadata(SITE, hidden, undefined).robots).toEqual({
      index: false,
      follow: true,
    });
  });

  it("points og:url at an off-site canonical", () => {
    expect(entryMetadata(SITE, crossPosted, undefined).openGraph?.url).toBe(
      "https://elsewhere.test/original",
    );
  });

  it("drops hreflang when either side of a pair is not indexable", () => {
    const noindexHausa = { ...hausa, noindex: true };
    expect(
      entryMetadata(SITE, english, noindexHausa).alternates?.languages,
    ).toBe(undefined);
    expect(
      entryMetadata(SITE, noindexHausa, english).alternates?.languages,
    ).toBe(undefined);
  });
});

describe("JSON-LD", () => {
  it("escapes < so content can never close the script tag", () => {
    const doc = entryJsonLd(SITE, english, `${SITE}/og.png`);
    const json = serializeJsonLd(doc);
    expect(json).not.toContain("<");
    expect(json).toContain("\\u003cangle>");
    expect(JSON.parse(json)).toEqual(doc);
  });

  it("describes an Entry as BlogPosting with a breadcrumb trail", () => {
    const doc = entryJsonLd(
      SITE,
      english,
      `${SITE}${entryOgImagePath(english)}`,
    );
    const article = nodeOfType<ArticleNode>(doc, "BlogPosting");
    expect(article).toMatchObject({
      headline: english.title,
      datePublished: english.date,
      dateModified: english.updated,
      inLanguage: "en",
      keywords: "react, web",
      wordCount: 420,
      image: [`${SITE}/english-post/opengraph-image`],
      mainEntityOfPage: { "@id": `${SITE}/english-post` },
      author: { name: "Ismail Idris", url: `${SITE}/about` },
    });
    const crumbs = nodeOfType<BreadcrumbListNode>(doc, "BreadcrumbList");
    expect(crumbs.itemListElement.map((item) => item.item)).toEqual([
      SITE,
      `${SITE}/writing`,
      `${SITE}/english-post`,
    ]);
  });

  it("uses TechArticle for tutorials and the canonical for mainEntityOfPage", () => {
    expect(
      entryJsonLd(SITE, tutorial, "x")["@graph"].some(
        (node) => node["@type"] === "TechArticle",
      ),
    ).toBe(true);
    const crossDoc = entryJsonLd(SITE, crossPosted, "x");
    expect(
      nodeOfType<ArticleNode>(crossDoc, "BlogPosting").mainEntityOfPage,
    ).toEqual({
      "@type": "WebPage",
      "@id": "https://elsewhere.test/original",
    });
  });

  it("home is WebSite + Person; about is a ProfilePage about the Person", () => {
    const home = homeJsonLd(SITE);
    expect(home["@graph"].map((node) => node["@type"])).toEqual([
      "WebSite",
      "Person",
    ]);
    const person = home["@graph"][1];
    expect(person).toMatchObject({
      "@id": `${SITE}/#person`,
      sameAs: Object.values(siteConfig.socials).filter((url) => url !== null),
    });
    const about = profilePageJsonLd(SITE, page("about", { title: "About" }));
    expect(about["@graph"][0]).toMatchObject({
      "@type": "ProfilePage",
      mainEntity: { "@id": `${SITE}/#person` },
    });
    expect(JSON.stringify(home)).not.toContain("SearchAction");
  });
});

describe("feeds", () => {
  const items = content.getLatest(30);

  it("escapes XML special characters", () => {
    expect(escapeXml(`a & b < c > "d" 'e'`)).toBe(
      "a &amp; b &lt; c &gt; &quot;d&quot; &apos;e&apos;",
    );
  });

  it("builds valid RSS with entries and links, never drafts", () => {
    const xml = buildRss(SITE, items);
    expect(XMLValidator.validate(xml)).toBe(true);
    const channel = parser.parse(xml).rss.channel;
    const feedItems: Array<{ title: string; link: string }> = channel.item;
    expect(feedItems.map((item) => item.link)).toContain(
      "https://example.com/a-video",
    );
    expect(feedItems.map((item) => item.link)).toContain(
      `${SITE}/english-post`,
    );
    expect(xml).not.toContain("draft-post");
    expect(
      feedItems.find((item) => item.link.endsWith("english-post"))?.title,
    ).toBe(english.title);
    expect(channel["atom:link"]["@_href"]).toBe(`${SITE}/rss.xml`);
  });

  it("builds a JSON Feed 1.1 document", () => {
    const feed = JSON.parse(buildJsonFeed(SITE, items)) as JsonFeed;
    expect(feed.version).toBe("https://jsonfeed.org/version/1.1");
    expect(feed.feed_url).toBe(`${SITE}/feed.json`);
    expect(feed.items).toHaveLength(items.length);
    const videoItem = feed.items.find((item) => item.id.endsWith("a-video"));
    expect(videoItem?.external_url).toBe("https://example.com/a-video");
    expect(feed.items.every((item) => item.content_text.length > 0)).toBe(true);
  });
});

describe("sitemap", () => {
  const urls = buildSitemap(SITE, content).map((entry) => entry.url);

  it("lists home, static pages, indexable entries and big tags", () => {
    expect(urls).toEqual(
      expect.arrayContaining([
        SITE,
        `${SITE}/writing`,
        `${SITE}/projects`,
        `${SITE}/subscribe`,
        `${SITE}/about`,
        `${SITE}/uses`,
        `${SITE}/english-post`,
        `${SITE}/hausa-post`,
        `${SITE}/self-canonical`,
        `${SITE}/tags/react`,
      ]),
    );
  });

  it("never lists drafts, noindex, off-site canonicals, links, .md or thin tags", () => {
    for (const excluded of [
      "draft-post",
      "hidden-post",
      "cross-posted",
      "a-video",
      ".md",
      "/privacy",
      "/tags/rare",
    ]) {
      expect(urls.some((url) => url.includes(excluded))).toBe(false);
    }
  });

  it("dates entries by their last update", () => {
    const item = buildSitemap(SITE, content).find(
      (entry) => entry.url === `${SITE}/english-post`,
    );
    expect(item?.lastModified).toBe("2026-09-10");
  });
});

describe("robots", () => {
  it("allows production and points to the sitemap", () => {
    expect(buildRobots(SITE, true)).toEqual({
      rules: { userAgent: "*", allow: "/", disallow: "/api/" },
      sitemap: `${SITE}/sitemap.xml`,
    });
  });

  it("disallows everything on preview deploys", () => {
    expect(buildRobots(SITE, false)).toEqual({
      rules: { userAgent: "*", disallow: "/" },
    });
  });
});

describe("llms.txt and markdown", () => {
  it("lists indexable entries by their markdown URL", () => {
    const text = buildLlmsTxt(SITE, content);
    expect(text).toMatch(/^# Aiiman\n\n> /);
    expect(text).toContain(`(${SITE}/english-post.md)`);
    for (const excluded of [
      "hidden-post",
      "cross-posted",
      "draft-post",
      "a-video",
    ]) {
      expect(text).not.toContain(excluded);
    }
  });

  it("renders an entry as markdown with its canonical", () => {
    const md = buildEntryMarkdown(SITE, english);
    expect(md).toMatch(/^# An English post/);
    expect(md).toContain(`- Canonical: ${SITE}/english-post`);
    expect(md).toContain("- Updated: 2026-09-10");
    expect(md).toContain("## Heading\n\nBody text.");
  });
});

describe("security.txt", () => {
  const now = new Date("2026-10-17T15:30:00Z");

  it("uses the email when set and expires under a year out", () => {
    const text = buildSecurityTxt(SITE, now, {
      email: "me@example.test",
      socials: {
        x: null,
        github: null,
        youtube: null,
        tiktok: null,
        instagram: null,
        facebook: null,
        linkedin: null,
      },
    });
    expect(text).toContain("Contact: mailto:me@example.test");
    expect(text).toContain("Expires: 2027-10-16T00:00:00.000Z");
    expect(text).toContain(`Canonical: ${SITE}/.well-known/security.txt`);
  });

  it("falls back to the X profile, then the about page", () => {
    const none = {
      x: null,
      github: null,
      youtube: null,
      tiktok: null,
      instagram: null,
      facebook: null,
      linkedin: null,
    };
    expect(
      buildSecurityTxt(SITE, now, {
        email: null,
        socials: { ...none, x: "https://x.com/me" },
      }),
    ).toContain("Contact: https://x.com/me");
    expect(
      buildSecurityTxt(SITE, now, { email: null, socials: none }),
    ).toContain(`Contact: ${SITE}/about`);
  });
});
