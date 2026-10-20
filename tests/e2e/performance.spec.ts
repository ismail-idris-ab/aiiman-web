import { expect, test } from "@playwright/test";

test("no font preloads compete with the stylesheet", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('link[rel="preload"][as="font"]')).toHaveCount(0);
});

test("the first image near the top of a post loads eagerly at high priority", async ({
  page,
}) => {
  await page.goto("/e2e-tutorial-images");
  const images = page.locator("article img");
  await expect(images.first()).toHaveAttribute("loading", "eager");
  await expect(images.first()).toHaveAttribute("fetchpriority", "high");
  for (const img of await images.all()) {
    await expect(img).toHaveAttribute("width", /\d+/);
    await expect(img).toHaveAttribute("height", /\d+/);
  }
});

test("pages have no layout shift while loading", async ({ page }) => {
  for (const path of ["/", "/writing", "/e2e-tutorial-images"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const cls = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          let total = 0;
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries() as Array<
              PerformanceEntry & { value: number; hadRecentInput: boolean }
            >) {
              if (!entry.hadRecentInput) total += entry.value;
            }
          }).observe({ type: "layout-shift", buffered: true });
          setTimeout(() => resolve(total), 500);
        }),
    );
    expect(cls, path).toBeLessThan(0.05);
  }
});
