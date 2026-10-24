// #10: upload images and a cover in the admin (phone), publish, then check the
// site renders them with dimensions, one priority image, no layout shift.
// The fake Blob host is served by the local API's file server on :3199.
import { createRequire } from "node:module";
import AxeBuilder from "@axe-core/playwright";
import { chromium, devices } from "@playwright/test";

const require = createRequire(new URL("../../api/package.json", import.meta.url));
const sharp = require("sharp");

const ADMIN = "http://localhost:3002";
const SITE = "http://localhost:3100";
const FILES = "http://localhost:3199";
const BLOB = "https://localtest.public.blob.vercel-storage.com/";
const check = (label, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${extra ? ` (${extra})` : ""}`);
  if (!ok) process.exitCode = 1;
};

// A 4000×3000 noisy JPEG: well over 4 MB, so the admin must shrink it first.
const noise = Buffer.alloc(4000 * 3000 * 3);
for (let i = 0; i < noise.length; i++) noise[i] = (i * 2654435761) >>> 24;
const bigPhoto = await sharp(noise, { raw: { width: 4000, height: 3000, channels: 3 } })
  .jpeg({ quality: 98 })
  .toBuffer();
const coverPng = await sharp({
  create: { width: 1200, height: 800, channels: 3, background: "#2e3d8f" },
})
  .png()
  .toBuffer();
console.log(`big photo ${(bigPhoto.length / 1024 / 1024).toFixed(1)} MB`);

const serveBlob = async (route) => {
  const path = route.request().url().slice(BLOB.length);
  const res = await fetch(`${FILES}/${path}`);
  await route.fulfill({
    status: res.status,
    contentType: res.headers.get("content-type") ?? "application/octet-stream",
    body: Buffer.from(await res.arrayBuffer()),
  });
};

const browser = await chromium.launch();
const adminContext = await browser.newContext({ ...devices["Pixel 5"] });
await adminContext.route(`${BLOB}**`, serveBlob);
const admin = await adminContext.newPage();
const problems = [];
admin.on("console", (m) => {
  if (m.type() === "error" && !/401|400 \(Bad Request\)/.test(m.text())) problems.push(m.text());
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
await admin.getByLabel("Title", { exact: true }).fill(`Walls of old Kano ${stamp}`);
await admin
  .getByLabel("Summary")
  .fill("A walk along the old city walls, with photos uploaded from a phone in the admin.");
// An MDX tag: tag pages for admin-only tags arrive with categories (#17).
await admin.getByLabel("Tags").fill("typescript");
await admin.getByRole("textbox", { name: "Body" }).click();
await admin.keyboard.type("Intro paragraph before the photo.");
await admin.keyboard.press("Enter");

// Insert an image: alt text first.
await admin.getByRole("button", { name: "Image", exact: true }).click();
const picker = admin.getByRole("group", { name: "Insert an image" });
await picker.getByLabel("Image file").setInputFiles({
  name: "walls.jpg",
  mimeType: "image/jpeg",
  buffer: bigPhoto,
});
await picker.getByRole("button", { name: "Upload and insert" }).click();
check(
  "upload refused without alt text",
  (await picker.getByRole("alert").textContent())?.includes("Add alt text") === true,
);
await picker.getByLabel("Alt text").fill("Mud-brick city wall at dusk");
const uploadResponse = admin.waitForResponse((r) => r.url().endsWith("/api/uploads"));
await picker.getByRole("button", { name: "Upload and insert" }).click();
const uploaded = await uploadResponse;
const sentBytes = uploaded.request().postDataBuffer()?.length ?? 0;
check("big photo shrunk in the browser before upload", sentBytes > 0 && sentBytes <= 4 * 1024 * 1024, `${(sentBytes / 1024 / 1024).toFixed(2)} MB sent`);
check("upload answered 201", uploaded.status() === 201);
const editorImg = admin.locator(".rich-editor-content img");
await editorImg.waitFor();
check("image shows in the editor", (await editorImg.evaluate((img) => img.complete && img.naturalWidth)) > 0);
const dims = await editorImg.evaluate((img) => [img.getAttribute("width"), img.getAttribute("height")]);
check("stored at most 2400px with its ratio", dims[0] === "2400" && dims[1] === "1800", dims.join("×"));

// Clearing the alt blocks saving; the field names the image.
await editorImg.click();
const altField = admin.locator(".toolbar").getByLabel("Alt text");
check("selected image shows its alt in the toolbar", (await altField.inputValue()) === "Mud-brick city wall at dusk");
await altField.fill("");
await admin.getByRole("button", { name: "Save draft" }).click();
const bodyError = admin.locator("#body-error");
await bodyError.waitFor();
check("save refused for an image without alt", (await bodyError.textContent())?.includes("image 1") === true, await bodyError.textContent());
await editorImg.click();
await altField.fill("Mud-brick city wall at dusk");

// Cover.
const coverPicker = admin.getByRole("group", { name: "Shown under the post title" });
await coverPicker.getByLabel("Image file").setInputFiles({
  name: "cover.png",
  mimeType: "image/png",
  buffer: coverPng,
});
await coverPicker.getByLabel("Alt text").fill("Indigo dyeing pit, Kofar Mata");
await coverPicker.getByRole("button", { name: "Upload cover" }).click();
await admin.locator(".cover-preview").waitFor();
check("cover preview shown", (await admin.locator(".cover-preview").evaluate((img) => img.naturalWidth)) === 1200);

const slug = await admin.getByLabel("Slug").inputValue();
await admin.getByRole("button", { name: "Publish" }).click();
await admin.getByRole("status").filter({ hasText: "Published at" }).waitFor();
const overflow = await admin.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
check("admin has no horizontal scroll on a phone", overflow <= 0, `${overflow}px`);
check("admin: no console errors or CSP violations", problems.length === 0, problems.join(" | "));
await adminContext.close();

// The site, on a phone. next/image's optimiser can't reach the fake host
// from the server, so the browser's /_next/image requests get the file directly.
const siteContext = await browser.newContext({ ...devices["Pixel 5"] });
await siteContext.route("**/_next/image?**", async (route) => {
  const source = new URL(route.request().url()).searchParams.get("url") ?? "";
  if (!source.startsWith(BLOB)) return route.continue();
  const res = await fetch(`${FILES}/${source.slice(BLOB.length)}`);
  await route.fulfill({
    status: res.status,
    contentType: res.headers.get("content-type") ?? "image/jpeg",
    body: Buffer.from(await res.arrayBuffer()),
  });
});
const site = await siteContext.newPage();
const siteErrors = [];
// Resource failures are judged by URL below; tag pages for admin-only tags arrive with #17.
site.on("console", (m) => m.type() === "error" && !m.text().startsWith("Failed to load resource") && siteErrors.push(m.text()));
site.on("response", (r) => {
  if (r.status() < 400) return;
  console.log(`  ${r.status()} ${r.url()}`);
  if (!new URL(r.url()).pathname.startsWith("/tags/")) siteErrors.push(`${r.status()} ${r.url()}`);
});
await site.addInitScript(() => {
  window.__cls = 0;
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__cls += entry.value;
  }).observe({ type: "layout-shift", buffered: true });
});
const res = await site.goto(`${SITE}/${slug}`);
check("post page 200", res?.status() === 200);
const images = await site.locator("article img").evaluateAll((list) =>
  list.map((img) => ({
    alt: img.alt,
    width: img.getAttribute("width"),
    height: img.getAttribute("height"),
    loading: img.getAttribute("loading"),
    priority: img.getAttribute("fetchpriority"),
    blur: img.style.backgroundImage.startsWith('url("data:image/svg+xml'),
  })),
);
console.log(JSON.stringify(images));
const [cover, body] = images;
check("cover first, eager and high priority", cover?.alt === "Indigo dyeing pit, Kofar Mata" && cover.loading === "eager" && cover.priority === "high");
check("body image lazy with no priority", body?.alt === "Mud-brick city wall at dusk" && body.loading === "lazy" && body.priority === null);
check("cover is the only high-priority image", images.filter((i) => i.priority === "high").length === 1);
// next/image drops the placeholder once the image loads, so read the server HTML.
const html = await (await fetch(`${SITE}/${slug}`)).text();
const served = html.match(/<img [^>]*>/g)?.filter((tag) => tag.includes("localtest.public.blob")) ?? [];
check("every image has dimensions", images.every((i) => i.width && i.height));
check("every image is served with a blur placeholder", served.length === 2 && served.every((tag) => tag.includes("data:image/svg+xml")), `${served.length} images`);
await site.mouse.wheel(0, 3000);
await site.waitForTimeout(1500);
const loaded = await site.locator("article img").evaluateAll((list) => list.every((img) => img.complete && img.naturalWidth > 0));
check("both images loaded after scrolling", loaded);
const cls = await site.evaluate(() => window.__cls);
check("no layout shift", cls < 0.05, `CLS ${cls.toFixed(4)}`);
const axe = await new AxeBuilder({ page: site }).include("article").analyze();
check("axe passes on the article", axe.violations.length === 0, axe.violations.map((v) => v.id).join(","));
check("site: no console errors", siteErrors.length === 0, siteErrors.join(" | "));
const md = await (await fetch(`${SITE}/${slug}.md`)).text();
check(".md route has the image as Markdown", md.includes(`![Mud-brick city wall at dusk](<${BLOB}images/`));
await browser.close();
