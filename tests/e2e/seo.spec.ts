import { expect, test, type Page } from "@playwright/test";
import { XMLParser, XMLValidator } from "fast-xml-parser";

const ORIGIN = "http://localhost:3100";
const parser = new XMLParser({ ignoreAttributes: false });

const PAGES = [
  { path: "/", canonical: ORIGIN, jsonLd: ["WebSite", "Person"] },
  { path: "/writing", canonical: `${ORIGIN}/writing`, jsonLd: [] },
  {
    path: "/e2e-essay-react",
    canonical: `${ORIGIN}/e2e-essay-react`,
    jsonLd: ["BlogPosting", "BreadcrumbList"],
  },
  {
    path: "/e2e-tutorial-images",
    canonical: `${ORIGIN}/e2e-tutorial-images`,
    jsonLd: ["TechArticle", "BreadcrumbList"],
  },
  {
    path: "/tags/react",
    canonical: `${ORIGIN}/tags/react`,
    jsonLd: ["BreadcrumbList"],
  },
  {
    path: "/about",
    canonical: `${ORIGIN}/about`,
    jsonLd: ["ProfilePage", "Person"],
  },
] as const;

const meta = (page: Page, selector: string) =>
  page.locator(selector).first().getAttribute("content");

async function jsonLdTypes(page: Page): Promise<string[]> {
  const blocks = await page
    .locator('script[type="application/ld+json"]')
    .allTextContents();
  return blocks.flatMap((text) => {
    const doc = JSON.parse(text) as { "@graph": Array<{ "@type": string }> };
    return doc["@graph"].map((node) => node["@type"]);
  });
}

test.describe("page metadata", () => {
  const titles = new Set<string>();

  for (const { path, canonical, jsonLd } of PAGES) {
    test(`${path} has complete SEO metadata`, async ({ page, request }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);

      const title = await page.title();
      expect(title.length).toBeGreaterThan(0);
      expect(titles.has(title), `duplicate title: ${title}`).toBe(false);
      titles.add(title);

      expect(
        (await meta(page, 'meta[name="description"]'))?.length,
      ).toBeGreaterThan(0);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        "href",
        canonical,
      );
      await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
      await expect(page.locator('meta[name="keywords"]')).toHaveCount(0);

      await expect(
        page.locator('link[rel="alternate"][type="application/rss+xml"]'),
      ).toHaveAttribute("href", `${ORIGIN}/rss.xml`);
      await expect(
        page.locator('link[rel="alternate"][type="application/feed+json"]'),
      ).toHaveAttribute("href", `${ORIGIN}/feed.json`);

      expect(await meta(page, 'meta[property="og:title"]')).toBeTruthy();
      expect(await meta(page, 'meta[property="og:url"]')).toBe(canonical);
      expect(await meta(page, 'meta[name="twitter:card"]')).toBe(
        "summary_large_image",
      );
      expect(await meta(page, 'meta[name="twitter:creator"]')).toBe(
        "@aiiman_ai",
      );

      const image = await meta(page, 'meta[property="og:image"]');
      expect(image).toMatch(/^http:\/\/localhost:3100\/.*opengraph-image/);
      expect(await meta(page, 'meta[property="og:image:alt"]')).toBeTruthy();
      const png = await request.get(image ?? "");
      expect(png.status()).toBe(200);
      expect(png.headers()["content-type"]).toBe("image/png");

      await expect(page.locator("h1")).toHaveCount(1);
      expect(await jsonLdTypes(page)).toEqual(
        expect.arrayContaining([...jsonLd]),
      );
    });
  }

  test("filtered archive URLs keep the bare canonical", async ({ page }) => {
    await page.goto("/writing?type=note&tag=react");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `${ORIGIN}/writing`,
    );
  });

  test("posts carry article metadata and an author byline", async ({
    page,
  }) => {
    await page.goto("/e2e-essay-react");
    expect(await meta(page, 'meta[property="og:type"]')).toBe("article");
    expect(await meta(page, 'meta[property="article:published_time"]')).toBe(
      "2026-03-01T00:00:00.000Z",
    );
    expect(
      await meta(page, 'meta[property="article:modified_time"]'),
    ).toBeTruthy();
    await expect(
      page.getByRole("link", { name: "Ismail Idris" }),
    ).toHaveAttribute("href", "/about");
  });

  test("JSON-LD image points at the served share card", async ({
    page,
    request,
  }) => {
    await page.goto("/e2e-essay-react");
    const [text] = await page
      .locator('script[type="application/ld+json"]')
      .allTextContents();
    const doc = JSON.parse(text ?? "{}") as {
      "@graph": Array<{ "@type": string; image?: string[] }>;
    };
    const imageUrl = doc["@graph"].find(
      (node) => node["@type"] === "BlogPosting",
    )?.image?.[0];
    expect(imageUrl).toBe(`${ORIGIN}/e2e-essay-react/opengraph-image`);
    expect((await request.get(imageUrl ?? "")).status()).toBe(200);
  });

  test("paired EN/HA entries emit hreflang with x-default", async ({
    page,
  }) => {
    for (const path of ["/e2e-essay-react", "/e2e-hausa-note"]) {
      await page.goto(path);
      const hreflang = (lang: string) =>
        page.locator(`link[rel="alternate"][hreflang="${lang}"]`);
      await expect(hreflang("en")).toHaveAttribute(
        "href",
        `${ORIGIN}/e2e-essay-react`,
      );
      await expect(hreflang("ha")).toHaveAttribute(
        "href",
        `${ORIGIN}/e2e-hausa-note`,
      );
      await expect(hreflang("x-default")).toHaveAttribute(
        "href",
        `${ORIGIN}/e2e-essay-react`,
      );
    }
    await page.goto("/e2e-note-react");
    await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(
      0,
    );
  });

  test("404 is a real 404, noindex, without a canonical", async ({ page }) => {
    const response = await page.goto("/no-such-page");
    expect(response?.status()).toBe(404);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      "noindex",
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
    await expect(page.locator("h1")).toHaveCount(1);
  });
});

test.describe("crawler files", () => {
  test("sitemap.xml is valid and lists only indexable URLs", async ({
    request,
  }) => {
    const response = await request.get("/sitemap.xml");
    expect(response.status()).toBe(200);
    const xml = await response.text();
    expect(XMLValidator.validate(xml)).toBe(true);
    const urls = (parser.parse(xml).urlset.url as Array<{ loc: string }>).map(
      (url) => url.loc,
    );
    expect(urls).toEqual(
      expect.arrayContaining([
        ORIGIN,
        `${ORIGIN}/writing`,
        `${ORIGIN}/e2e-essay-react`,
        `${ORIGIN}/tags/react`,
      ]),
    );
    for (const url of urls) {
      expect(url).not.toMatch(
        /\.md$|draft|scheduled|\/tags\/(typescript|web)$|\/$/,
      );
      expect(url.startsWith(ORIGIN)).toBe(true);
    }
    expect(urls.some((url) => url.includes("talk-video"))).toBe(false);
  });

  test("rss.xml is valid RSS with entries and links", async ({ request }) => {
    const response = await request.get("/rss.xml");
    expect(response.headers()["content-type"]).toContain("application/rss+xml");
    const xml = await response.text();
    expect(XMLValidator.validate(xml)).toBe(true);
    const items = parser.parse(xml).rss.channel.item as Array<{
      title: string;
      link: string;
    }>;
    expect(items).toHaveLength(6);
    expect(items.map((item) => item.link)).toContain(
      `${ORIGIN}/e2e-essay-react`,
    );
    expect(items.some((item) => !item.link.startsWith(ORIGIN))).toBe(true);
    expect(xml).not.toContain("Fixture draft");
  });

  test("feed.json is a valid JSON Feed", async ({ request }) => {
    const response = await request.get("/feed.json");
    expect(response.headers()["content-type"]).toContain(
      "application/feed+json",
    );
    const feed = (await response.json()) as {
      version: string;
      items: Array<{ id: string; title: string }>;
    };
    expect(feed.version).toBe("https://jsonfeed.org/version/1.1");
    expect(feed.items).toHaveLength(6);
  });

  test("robots.txt allows crawling and references the sitemap", async ({
    request,
  }) => {
    const text = await (await request.get("/robots.txt")).text();
    expect(text).toContain("Allow: /");
    expect(text).toContain("Disallow: /api/");
    expect(text).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
  });

  test("llms.txt lists published entries only", async ({ request }) => {
    const text = await (await request.get("/llms.txt")).text();
    expect(text).toMatch(/^# Aiiman/);
    expect(text).toContain(`${ORIGIN}/e2e-essay-react.md`);
    expect(text).not.toContain("draft");
    expect(text).not.toContain("talk-video");
  });

  test(".md routes serve markdown, noindex, with a canonical Link header", async ({
    request,
  }) => {
    const response = await request.get("/e2e-essay-react.md");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/markdown");
    expect(response.headers()["x-robots-tag"]).toBe("noindex");
    expect(response.headers().link).toBe(
      `<${ORIGIN}/e2e-essay-react>; rel="canonical"`,
    );
    expect(await response.text()).toMatch(
      /^# Fixture essay about React patterns/,
    );
    expect((await request.get("/e2e-draft-hidden.md")).status()).toBe(404);
  });

  test("security.txt has a contact and a future expiry", async ({
    request,
  }) => {
    const text = await (await request.get("/.well-known/security.txt")).text();
    expect(text).toMatch(/^Contact: \S+/m);
    const expires = /^Expires: (.+)$/m.exec(text)?.[1];
    expect(new Date(expires ?? "").getTime()).toBeGreaterThan(Date.now());
  });

  test("manifest and icons are served", async ({ request }) => {
    const manifest = (await (
      await request.get("/manifest.webmanifest")
    ).json()) as {
      icons: Array<{ src: string }>;
    };
    for (const icon of [...manifest.icons.map((i) => i.src), "/apple-icon"]) {
      expect((await request.get(icon)).headers()["content-type"]).toBe(
        "image/png",
      );
    }
  });
});
