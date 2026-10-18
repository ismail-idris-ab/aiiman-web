import { expect, test, type Page } from "@playwright/test";

/** Published fixture Items: 5 entries + 1 link. The draft and the 2099-dated post must never render. */
const PUBLISHED = 6;

const count = (page: Page) => page.getByText(/^\d+ (entry|entries)/);
const visibleRows = (page: Page) =>
  page.locator("#archive-list [data-item-id]:not([hidden])");

test.describe("/writing archive", () => {
  test("server-renders every published item and nothing else", async ({
    page,
  }) => {
    const response = await page.goto("/writing");
    expect(response?.status()).toBe(200);
    await expect(count(page)).toHaveText(`${PUBLISHED} entries`);
    await expect(page.locator("#archive-list [data-item-id]")).toHaveCount(
      PUBLISHED,
    );
    await expect(
      page.getByText("Fixture draft that must never appear"),
    ).toHaveCount(0);
    await expect(
      page.getByText("Fixture scheduled post far in the future"),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { level: 2, name: "2026" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "2025" }),
    ).toBeVisible();
  });

  test("filters update the URL and the back button restores them", async ({
    page,
  }) => {
    await page.goto("/writing");

    await page.getByLabel("Type", { exact: true }).selectOption("note");
    await expect(page).toHaveURL(/\/writing\?type=note$/);
    await expect(count(page)).toHaveText("2 entries match these filters");
    await expect(visibleRows(page)).toHaveCount(2);

    await page.getByLabel("Tag", { exact: true }).selectOption("react");
    await expect(page).toHaveURL(/\/writing\?type=note&tag=react$/);

    await page.getByLabel("Language", { exact: true }).selectOption("ha");
    await expect(page).toHaveURL(/lang=ha/);
    await expect(visibleRows(page)).toHaveCount(1);

    await page.goBack();
    await expect(page).toHaveURL(/\/writing\?type=note&tag=react$/);
    await expect(page.getByLabel("Language", { exact: true })).toHaveValue("");
    await expect(visibleRows(page)).toHaveCount(2);

    await page.goBack();
    await page.goBack();
    await expect(page).toHaveURL(/\/writing$/);
    await expect(count(page)).toHaveText(`${PUBLISHED} entries`);
  });

  test("deep links apply filters on load", async ({ page }) => {
    await page.goto("/writing?tag=typescript");
    await expect(page.getByLabel("Tag", { exact: true })).toHaveValue(
      "typescript",
    );
    await expect(visibleRows(page)).toHaveCount(2);
    // A year with no matching rows is hidden entirely.
    await expect(
      page.getByRole("heading", { level: 2, name: "2026" }),
    ).toBeHidden();
  });

  test("text filter matches title, summary and tags", async ({ page }) => {
    await page.goto("/writing");
    await page.getByLabel("Search this list").fill("snippet typescript");
    await expect(page).toHaveURL(/q=snippet\+typescript/);
    await expect(visibleRows(page)).toHaveCount(1);
  });

  test("empty state offers to clear filters", async ({ page }) => {
    await page.goto("/writing?type=podcast");
    await expect(count(page)).toHaveText("0 entries match these filters");
    await expect(page.getByText("Nothing matches these filters")).toBeVisible();
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(page).toHaveURL(/\/writing$/);
    await expect(visibleRows(page)).toHaveCount(PUBLISHED);
  });

  test("unknown filter values are ignored", async ({ page }) => {
    await page.goto("/writing?type=bogus&lang=xx");
    await expect(count(page)).toHaveText(`${PUBLISHED} entries`);
  });
});

test.describe("tag pages", () => {
  test("a tag with 3+ items is indexable", async ({ page }) => {
    const response = await page.goto("/tags/react");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("#react");
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
    await expect(
      page.getByRole("navigation", { name: "Breadcrumb" }),
    ).toBeVisible();
  });

  test("a tag with fewer than 3 items is noindex, follow", async ({ page }) => {
    await page.goto("/tags/typescript");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      "noindex, follow",
    );
  });

  test("an unknown tag is a real 404", async ({ page }) => {
    const response = await page.goto("/tags/does-not-exist");
    expect(response?.status()).toBe(404);
  });
});
