import { expect, test } from "@playwright/test";

const EXPECTED_HEADERS: Record<string, string> = {
  "strict-transport-security": "max-age=63072000; includeSubDomains",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "cross-origin-opener-policy": "same-origin",
  "permissions-policy":
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
};

const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://i.ytimg.com",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-src https://www.youtube-nocookie.com https://platform.twitter.com https://www.tiktok.com https://www.instagram.com https://gist.github.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
];

for (const path of ["/", "/e2e-essay-react", "/rss.xml"]) {
  test(`${path} sends every security header`, async ({ request }) => {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    const headers = response.headers();
    for (const [name, value] of Object.entries(EXPECTED_HEADERS)) {
      expect(headers[name], name).toBe(value);
    }
    const csp = headers["content-security-policy"] ?? "";
    expect(csp.split("; ")).toEqual(CSP_DIRECTIVES);
    expect(csp).not.toContain("unsafe-eval");
    expect(headers["x-powered-by"]).toBeUndefined();
  });
}

test("pages run under the CSP with no violations or console errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  for (const path of [
    "/",
    "/e2e-essay-react",
    "/e2e-tutorial-images",
    "/writing",
  ]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
  }
  // Scripts executed under the CSP: the theme select is hydrated and works.
  await page.getByLabel("Colour theme").selectOption("dark");
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  expect(errors).toEqual([]);
});

test("newsletter shows the coming-soon state when Buttondown isn't configured", async ({
  page,
}) => {
  await page.goto("/subscribe");
  await expect(page.getByRole("status")).toContainText(
    "Newsletter coming soon",
  );
  await expect(page.getByLabel("Email address")).toHaveCount(0);
});

test("unknown pages return a 404 without stack traces or paths", async ({
  request,
}) => {
  const response = await request.get("/definitely-missing");
  expect(response.status()).toBe(404);
  const body = await response.text();
  expect(body).not.toMatch(/node_modules|[A-Z]:\\|at \w+ \(/);
});
