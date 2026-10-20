import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const PAGES = [
  "/",
  "/writing",
  "/e2e-essay-react",
  "/e2e-tutorial-images",
  "/e2e-hausa-note",
  "/tags/react",
  "/projects",
  "/about",
  "/uses",
  "/privacy",
  "/subscribe",
  "/no-such-page",
];

async function seriousViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  return violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map(
      (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
    );
}

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`${colorScheme} theme`, () => {
    test.use({ colorScheme });

    for (const path of PAGES) {
      test(`${path} has no serious axe violations`, async ({ page }) => {
        await page.goto(path);
        await expect(page.locator("html")).toHaveClass(
          colorScheme === "dark" ? /\bdark\b/ : /\blight\b/,
        );
        expect(await seriousViolations(page)).toEqual([]);
      });
    }

    test("open search dialog has no serious axe violations", async ({
      page,
    }) => {
      await page.goto("/");
      await page.keyboard.press("Control+k");
      await page.getByRole("combobox", { name: "Search posts" }).fill("react");
      await expect(page.getByRole("option").first()).toBeVisible();
      expect(await seriousViolations(page)).toEqual([]);
    });
  });
}

test.describe("mobile", () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test("open menu has no serious axe violations and no horizontal scroll", async ({
    page,
  }) => {
    await page.goto("/e2e-tutorial-images");
    await page.getByRole("button", { name: "Menu" }).click();
    await expect(page.getByRole("button", { name: "Menu" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(await seriousViolations(page)).toEqual([]);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("touch targets in the header are at least 24×24", async ({ page }) => {
    await page.goto("/");
    const boxes = await page
      .locator("header a, header button, header select")
      .evaluateAll((els) =>
        els
          .filter((el) => (el as HTMLElement).offsetParent !== null)
          .map((el) => {
            const r = el.getBoundingClientRect();
            return {
              label: el.textContent?.trim() || el.id,
              w: r.width,
              h: r.height,
            };
          }),
      );
    for (const box of boxes) {
      expect(box.w, box.label).toBeGreaterThanOrEqual(24);
      expect(box.h, box.label).toBeGreaterThanOrEqual(24);
    }
  });
});

test("reduced motion disables transitions", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const duration = await page
    .locator("a")
    .first()
    .evaluate((el) => getComputedStyle(el).transitionDuration);
  expect(["0s", "1e-05s", "0.00001s"]).toContain(duration);
});
