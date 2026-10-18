import { expect, test } from "@playwright/test";

test.describe("search dialog", () => {
  test("loads the index lazily, only when first opened", async ({ page }) => {
    const indexRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().endsWith("/search-index.json"))
        indexRequests.push(request.url());
    });
    await page.goto("/");
    await page.waitForLoadState("load");
    expect(indexRequests).toHaveLength(0);

    await page.keyboard.press("Control+k");
    await expect(
      page.getByRole("dialog", { name: "Search the site" }),
    ).toBeVisible();
    await expect.poll(() => indexRequests.length).toBe(1);
  });

  test("Ctrl+K opens, arrow keys move, Enter navigates", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Control+k");
    const input = page.getByRole("combobox", { name: "Search posts" });
    await expect(input).toBeFocused();

    await input.fill("fixture");
    const options = page.getByRole("option");
    await expect(options.first()).toBeVisible();
    await expect(options.first()).toHaveAttribute("aria-selected", "true");

    await page.keyboard.press("ArrowDown");
    await expect(options.nth(1)).toHaveAttribute("aria-selected", "true");
    await expect(input).toHaveAttribute(
      "aria-activedescendant",
      (await options.nth(1).getAttribute("id")) ?? "",
    );

    await input.fill("snippet");
    await expect(options.first()).toContainText(
      "Fixture snippet for TypeScript",
    );
    await expect(options.first()).toContainText("Snippet");
    await expect(options.first()).toContainText("1 Jun 2025");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/e2e-snippet-typescript$/);
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("'/' opens search, but not while typing in a field", async ({
    page,
  }) => {
    await page.goto("/writing");
    await page.getByLabel("Search this list").click();
    await page.keyboard.type("/");
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByLabel("Search this list")).toHaveValue("/");

    await page.locator("body").click({ position: { x: 5, y: 300 } });
    await page.keyboard.press("/");
    await expect(
      page.getByRole("dialog", { name: "Search the site" }),
    ).toBeVisible();
  });

  test("Escape closes and returns focus to the trigger", async ({ page }) => {
    await page.goto("/");
    const trigger = page.getByRole("button", { name: /^Search/ }).first();
    await trigger.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("shows a clear message when nothing matches", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Control+k");
    await page.getByRole("combobox", { name: "Search posts" }).fill("zzzqqq");
    await expect(page.getByText("No results for “zzzqqq”.")).toBeVisible();
  });

  test("drafts and scheduled posts are not in the index", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Control+k");
    const input = page.getByRole("combobox", { name: "Search posts" });
    await input.fill("never appear");
    await expect(
      page.getByText("No results for “never appear”."),
    ).toBeVisible();
    // Fuzzy matching may surface other posts; the scheduled one must never be among them.
    await input.fill("scheduled post far future");
    await expect(page.getByText(/results?$|^No results/)).toBeVisible();
    await expect(
      page.getByRole("option", { name: /Fixture scheduled post/ }),
    ).toHaveCount(0);
  });

  test("the 404 page can open search", async ({ page }) => {
    const response = await page.goto("/no-such-page");
    expect(response?.status()).toBe(404);
    await page.getByRole("button", { name: "Search the site" }).click();
    await expect(
      page.getByRole("dialog", { name: "Search the site" }),
    ).toBeVisible();
  });
});
