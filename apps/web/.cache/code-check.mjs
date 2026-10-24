// #9: write a code block in the admin (phone), publish, then check the site
// highlights it, the copy button works, and contrast passes in both themes.
import AxeBuilder from "@axe-core/playwright";
import { chromium, devices } from "@playwright/test";

const ADMIN = "http://localhost:3002";
const SITE = "http://localhost:3100";
const check = (label, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${extra ? ` (${extra})` : ""}`);
  if (!ok) process.exitCode = 1;
};

const browser = await chromium.launch();
const admin = await (await browser.newContext({ ...devices["Pixel 5"] })).newPage();
const problems = [];
admin.on("console", (m) => {
  if (m.type() === "error" && !m.text().includes("401")) problems.push(m.text());
});
await admin.addInitScript(() => {
  document.addEventListener("securitypolicyviolation", (e) =>
    console.error(`CSP ${e.violatedDirective} ${e.blockedURI}`),
  );
});

const stamp = Date.now() % 100000;
await admin.goto(ADMIN);
await admin.getByLabel("Email").fill("admin@example.com");
await admin.getByLabel("Password").fill("local tracer password");
await admin.getByRole("button", { name: "Sign in" }).click();
await admin.getByRole("button", { name: "New post" }).click();
await admin.getByLabel("Title", { exact: true }).fill(`Formatting naira amounts ${stamp}`);
await admin.getByLabel("Summary").fill("A code block written in the admin and highlighted on the site with Shiki.");
await admin.getByLabel("Tags").fill("typescript");
await admin.getByRole("textbox", { name: "Body" }).click();
await admin.keyboard.type("Use Intl:");
await admin.keyboard.press("Enter");
await admin.getByRole("button", { name: "Code block" }).click();
await admin.getByLabel("Code language").selectOption("typescript");
await admin.keyboard.type("const naira = new Intl.NumberFormat(\"en-NG\");");
await admin.keyboard.press("Enter");
await admin.keyboard.type("naira.format(1500);");
const slug = await admin.getByLabel("Slug").inputValue();
await admin.getByRole("button", { name: "Publish" }).click();
await admin.getByRole("status").filter({ hasText: "Published at" }).waitFor();
check("admin published without errors or CSP violations", problems.length === 0, problems.join(" | "));

for (const scheme of ["light", "dark"]) {
  const context = await browser.newContext({ colorScheme: scheme });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: SITE });
  const page = await context.newPage();
  const res = await page.goto(`${SITE}/${slug}`);
  check(`${scheme}: post page 200`, res?.status() === 200);
  const pre = page.locator("figure[data-rehype-pretty-code-figure] pre");
  check(`${scheme}: highlighted as TypeScript`, (await pre.getAttribute("data-language")) === "typescript");
  const colour = await pre.locator("span[data-line] span").first().evaluate((el) => getComputedStyle(el).color);
  console.log(`  first token colour: ${colour}`);
  const results = await new AxeBuilder({ page }).include("figure").analyze();
  check(`${scheme}: axe passes on the code block`, results.violations.length === 0, results.violations.map((v) => v.id).join(","));
  if (scheme === "light") {
    await page.locator("figure").getByRole("button", { name: /Copy/ }).click();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    check("copy button copies the code", copied.includes("naira.format(1500);") && copied.includes("new Intl.NumberFormat"), JSON.stringify(copied));
  }
  await context.close();
}
await browser.close();
