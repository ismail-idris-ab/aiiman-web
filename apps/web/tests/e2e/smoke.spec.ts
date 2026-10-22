import { expect, test } from "@playwright/test";

const ROUTES = [
  "/",
  "/writing",
  "/e2e-essay-react",
  "/e2e-note-react",
  "/e2e-snippet-typescript",
  "/e2e-tutorial-images",
  "/e2e-hausa-note",
  "/tags/react",
  "/projects",
  "/about",
  "/uses",
  "/privacy",
  "/subscribe",
];

for (const path of ROUTES) {
  test(`${path} renders with one h1, ordered headings and landmarks`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(e.message));

    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.locator("h1")).toHaveCount(1);
    // Roles, not tags: an <article> may have its own header/footer, which aren't landmarks.
    for (const role of ["banner", "main", "contentinfo"] as const) {
      await expect(page.getByRole(role)).toHaveCount(1);
    }

    const levels = await page
      .locator("main h1, main h2, main h3, main h4, main h5, main h6")
      .evaluateAll((els) => els.map((el) => Number(el.tagName[1])));
    expect(levels[0]).toBe(1);
    for (let i = 1; i < levels.length; i++) {
      const [prev, current] = [levels[i - 1] ?? 1, levels[i] ?? 1];
      expect(current - prev, `h${prev} → h${current}`).toBeLessThanOrEqual(1);
    }

    await page.waitForLoadState("networkidle");
    expect(errors).toEqual([]);
  });
}

test("Hausa entries set lang=ha on the article", async ({ page }) => {
  await page.goto("/e2e-hausa-note");
  await expect(page.locator("article")).toHaveAttribute("lang", "ha");
});

test("theme choice persists across reloads and pages", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Colour theme").selectOption("dark");
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  await expect(page.getByLabel("Colour theme")).toHaveValue("dark");
  await page.goto("/writing");
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);

  await page.getByLabel("Colour theme").selectOption("light");
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/\blight\b/);
});

test("external links open safely", async ({ page }) => {
  await page.goto("/writing");
  const external = page.locator('main a[href^="http"]');
  expect(await external.count()).toBeGreaterThan(0);
  for (const link of await external.all()) {
    await expect(link).toHaveAttribute("rel", /noopener/);
    await expect(link).toHaveAttribute("rel", /noreferrer/);
  }
});
