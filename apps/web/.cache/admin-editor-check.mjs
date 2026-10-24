// Drives the built admin on a phone-sized screen: writes a formatted post with
// the toolbar, saves it, and inspects the stored doc. Logs CSP violations.
import { chromium, devices } from "@playwright/test";

const ADMIN = "http://localhost:3002";
const SHOTS = process.argv[2];
const browser = await chromium.launch();
const context = await browser.newContext({ ...devices["Pixel 5"] });
const page = await context.newPage();
const problems = [];
page.on("console", (msg) => {
  // The signed-out /api/auth/me check answers 401 by design.
  if (msg.type() === "error" && !msg.text().includes("401")) problems.push(msg.text().slice(0, 300));
});
page.on("pageerror", (error) => problems.push(`pageerror ${error.message}`));
await page.addInitScript(() => {
  document.addEventListener("securitypolicyviolation", (e) => {
    console.error(`CSP ${e.violatedDirective} blocked=${e.blockedURI}`);
  });
});

const check = (label, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${extra ? ` (${extra})` : ""}`);
  if (!ok) process.exitCode = 1;
};

await page.goto(ADMIN);
await page.getByLabel("Email").fill("admin@example.com");
await page.getByLabel("Password").fill("local tracer password");
await page.getByRole("button", { name: "Sign in" }).click();
await page.getByRole("button", { name: "New post" }).click();

await page.getByLabel("Title", { exact: true }).fill(`Writing with the rich editor on a phone ${Date.now() % 100000}`);
await page.getByLabel("Summary").fill("A post written on a small screen with headings, lists, links and a callout.");
await page.getByLabel("Tags").fill("web, nigeria");

const body = page.getByRole("textbox", { name: "Body" });
await body.click();
await page.keyboard.type("Intro paragraph with a ");
await page.getByRole("button", { name: "Bold" }).click();
await page.keyboard.type("bold");
await page.getByRole("button", { name: "Bold" }).click();
await page.keyboard.type(" word.");
await page.keyboard.press("Enter");
await page.getByRole("button", { name: "Heading 2" }).click();
await page.keyboard.type("A section heading");
await page.keyboard.press("Enter");
await page.getByRole("button", { name: "Bulleted list" }).click();
await page.keyboard.type("First item");
await page.keyboard.press("Enter");
await page.keyboard.type("Second item");
await page.keyboard.press("Enter");
await page.keyboard.press("Enter");
page.once("dialog", (dialog) => dialog.accept("https://example.com"));
await page.keyboard.type("Link here");
await page.keyboard.down("Shift");
for (let i = 0; i < 4; i += 1) await page.keyboard.press("ArrowLeft");
await page.keyboard.up("Shift");
await page.getByRole("button", { name: "Link" }).click();
await page.keyboard.press("ArrowRight");
await page.keyboard.press("End");
await page.keyboard.press("Enter");
await page.getByRole("button", { name: "Callout" }).click();
await page.keyboard.type("Store kobo, not naira.");
page.once("dialog", (dialog) => dialog.accept("Money tip"));
await page.getByRole("button", { name: "Callout title" }).click();

const toolbar = await page.getByRole("toolbar", { name: "Formatting" }).boundingBox();
const viewport = page.viewportSize();
check("toolbar fits the phone width", toolbar !== null && toolbar.width <= viewport.width, `${toolbar?.width}px of ${viewport.width}px`);
const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
check("no horizontal page scroll", scrollWidth <= viewport.width, `${scrollWidth}px`);
const smallest = await page.getByRole("toolbar").getByRole("button").evaluateAll((buttons) =>
  Math.min(...buttons.map((b) => Math.min(b.getBoundingClientRect().width, b.getBoundingClientRect().height))),
);
check("toolbar buttons are at least 44px", smallest >= 44, `${smallest}px`);
if (SHOTS) await page.screenshot({ path: `${SHOTS}/editor-phone.png`, fullPage: true });

await page.getByRole("button", { name: "Save draft" }).click();
await page.getByRole("status").filter({ hasText: "Draft saved." }).waitFor();

const posts = await (await page.request.get(`${ADMIN}/api/posts`)).json();
const doc = posts.posts.find((p) => p.title.startsWith("Writing with the rich editor")).body;
const types = doc.content.map((block) => block.type);
console.log(JSON.stringify(doc).slice(0, 900));
check("stored blocks", JSON.stringify(types.slice(0, 5)) === JSON.stringify(["paragraph", "heading", "bulletList", "paragraph", "callout"]), JSON.stringify(types));
check("bold mark stored", JSON.stringify(doc.content[0]).includes('"bold"'));
check("heading is h2", doc.content[1]?.attrs?.level === 2);
check("link stored", JSON.stringify(doc.content[3]).includes("https://example.com"));
check("callout title stored", doc.content[4]?.attrs?.title === "Money tip");
check("no console errors or CSP violations", problems.length === 0, problems.join(" | "));
await browser.close();
