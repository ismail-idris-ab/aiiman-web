import { expect, test } from "@playwright/test";

const isThirdParty = (url: string) => {
  const { protocol, hostname } = new URL(url);
  return (
    (protocol === "http:" || protocol === "https:") &&
    hostname !== "localhost" &&
    hostname !== "127.0.0.1"
  );
};

test("embeds request nothing from third parties until the reader taps", async ({
  page,
}) => {
  const thirdParty: string[] = [];
  // Recorded and refused: the test never depends on the providers being up.
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (!isThirdParty(url)) return route.continue();
    thirdParty.push(url);
    return route.abort();
  });

  await page.goto("/e2e-note-react");
  await page.mouse.wheel(0, 4000);
  await page.waitForLoadState("networkidle");
  expect(thirdParty).toEqual([]);
  await expect(page.locator("article iframe")).toHaveCount(0);

  for (const name of ["X", "TikTok", "Instagram", "GitHub Gist"]) {
    await expect(
      page.getByRole("button", { name: new RegExp(`^Load ${name} embed`) }),
    ).toBeVisible();
  }
  await expect(page.getByRole("link", { name: "Open on X" })).toHaveAttribute(
    "href",
    "https://x.com/vercel/status/1790123456789012345",
  );

  await page.getByRole("button", { name: /^Load X embed/ }).click();
  const frame = page.locator("article iframe");
  await expect(frame).toHaveCount(1);
  await expect(frame).toHaveAttribute(
    "src",
    "https://platform.twitter.com/embed/Tweet.html?id=1790123456789012345&dnt=true",
  );
  await expect(frame).toHaveAttribute("title", "Post by @vercel on X");
  await expect(frame).toHaveAttribute("sandbox", /allow-scripts/);
  await expect(frame).toBeFocused();
  await expect
    .poll(() => [...new Set(thirdParty.map((url) => new URL(url).origin))])
    .toEqual(["https://platform.twitter.com"]);
});
