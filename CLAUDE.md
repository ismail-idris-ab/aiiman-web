# CLAUDE.md

Personal publishing site for Ismail Idris — a "public notebook": one archive for essays, notes, tutorials, and links to videos/podcasts. Owner writes MDX locally, pushes to GitHub, Vercel deploys. Goal: fast on mobile/metered data in Nigeria, flawless technical SEO, zero runtime backend beyond the newsletter action.

Full spec lives in `BUILD_PROMPT.md` (if present). This file is the standing rulebook.

## Stack (fixed — ask before changing)

- Next.js (App Router, latest stable), TypeScript strict + `noUncheckedIndexedAccess`
- React Server Components by default; all content routes SSG with `dynamicParams = false`
- Tailwind CSS v4 (`@theme` tokens in `src/app/globals.css`) + `@tailwindcss/typography`
- Velite for MDX/YAML content → `.velite/`
- Shiki via `rehype-pretty-code`; `remark-gfm`, `rehype-slug`, `rehype-autolink-headings`
- MiniSearch, prebuilt index at `public/search-index.json`
- `next-themes`, `zod`, `@vercel/analytics`, `@vercel/speed-insights`
- Newsletter: Server Action → Buttondown; optional Upstash rate limit
- Vitest, Playwright + `@axe-core/playwright`
- pnpm, ESLint flat config (ESLint CLI), Prettier + Tailwind plugin
- Deploy: Vercel

## Commands

```bash
pnpm dev            # Velite watch + Next dev
pnpm content        # Velite build only (validates all content)
pnpm build          # velite build → search index → next build
pnpm start          # serve production build
pnpm typecheck
pnpm lint
pnpm test           # Vitest
pnpm test:e2e       # Playwright (needs a build)
pnpm check          # typecheck + lint + test — run before every commit
```

## Structure

```
content/
  entries/<slug>/index.mdx | entries/<slug>.mdx   # essays, notes, tutorials
  links/<slug>.mdx                                # external items (externalUrl required)
  projects/<slug>.yml
  pages/about.mdx | uses.mdx | privacy.mdx
scripts/build-search-index.ts
src/
  site.config.ts        # ONLY place for name, domain, author, socials
  env.ts                # Zod-validated env (server/client split)
  app/                  # routes, metadata, OG images, feeds, sitemap, robots
  components/           # ui/, mdx/, layout/, search/, newsletter/
  lib/content.ts        # all content access goes through here
  lib/seo/              # metadata + JSON-LD builders
tests/                  # unit/ and e2e/
```

## Writing content

- New post: create `content/entries/<slug>/index.mdx`, fill frontmatter, set `draft: false` when ready, push.
- Required: `title` (10–70), `summary` (50–160, becomes meta description), `date`, `type`, `tags` (1–5, kebab-case).
- Never use `#` (h1) in MDX bodies — the title is the h1. Start at `##`.
- Every image needs alt text; `cover` requires `coverAlt`.
- Hausa posts: `lang: ha`; pair translations with `translationOf: <slug>`.
- Slugs must not collide with routes: about, uses, privacy, projects, writing, tags, subscribe, search, api, rss.xml, feed.json, sitemap.xml, robots.txt, llms.txt, static, _next, md.
- Velite fails the build on invalid content. Fix the content, never loosen the schema to make it pass.

## Code conventions

- Server Components by default. `"use client"` only for: theme toggle, mobile nav, search dialog, archive filters, code copy button, YouTube facade, newsletter form.
- `src/components/mdx/mdx-content.tsx` is server-only. Never import it into a client component.
- All content reads go through `src/lib/content.ts` (it handles draft filtering).
- No `any`; use `unknown` and narrow. No placeholder logic or TODO stubs.
- Tailwind utilities only. No new CSS files; `globals.css` holds tokens, base, typography overrides, Shiki theme switching.
- Format dates on the server only (`en-GB`).
- `next/image` for every image, with dimensions. `next/font` for fonts (subsets `latin` + `latin-ext`; must render ɓ ɗ ƙ ƴ).
- Every new dependency needs a one-line justification in the Decisions log.
- Before using any library API, check the installed version's types or official docs. Don't guess.

## SEO rules (non-negotiable)

- Every page: unique title, description, absolute self-canonical (no query string, no trailing slash).
- Exactly one `h1` per page; headings never skip levels; semantic landmarks.
- Posts emit `BlogPosting` (or `TechArticle`) + `BreadcrumbList` JSON-LD; home emits `WebSite` + `Person`; about emits `ProfilePage`. Serialize JSON-LD with `<` escaped.
- Drafts, external links, `.md` routes, and noindex entries never appear in the sitemap.
- Tag pages with < 3 entries are `noindex, follow`.
- Non-production Vercel deploys are fully `noindex` (robots + `X-Robots-Tag`).
- Changing a published URL requires a permanent redirect in `next.config`. Ask first.
- OG image exists for every indexable route.

## Security rules

- Security headers are configured in `next.config`; don't weaken them. Production CSP never includes `'unsafe-eval'`.
- No `dangerouslySetInnerHTML` except escaped JSON-LD.
- Secrets only in server-only modules; nothing secret behind `NEXT_PUBLIC_`.
- Embeds only from the CSP allowlist (`youtube-nocookie.com`), sandboxed, lazy.
- External links get `rel="noopener noreferrer"`.
- Newsletter action: Zod validation, honeypot, rate limit, generic messages, no email addresses in logs.
- Never commit `.env*` (except `.env.example`). Never print secret values.

## Performance budgets

- Lighthouse mobile: Perf ≥ 95, A11y/Best Practices/SEO = 100.
- LCP < 2.0 s, CLS < 0.05, INP < 200 ms.
- No route's first-load JS more than 25 KB gzip above the framework baseline.

## Definition of done

1. `pnpm check` passes.
2. `pnpm build` passes from a clean state.
3. `pnpm test:e2e` passes (includes axe, SEO meta, security header checks).
4. No console errors or hydration warnings on affected pages.
5. Decisions log updated if a non-obvious choice was made.
6. Conventional commit (`feat:`, `fix:`, `content:`, `chore:` …), small and focused.

## Working with me

- I'm an experienced full-stack dev and PM. Be direct, skip basics, flag real trade-offs briefly.
- Ask before: changing architecture, adding paid services, changing URLs, deleting or rewriting my content.
- Don't invent facts about me, my projects, or my bio. Leave an HTML comment for me to fill instead.
- Never say something works unless you ran it. If a check couldn't run, say so.
- For audits, use a fresh subagent rather than reviewing your own work.

## Decisions log

<!-- Claude Code: append dated one-line entries here. Format: YYYY-MM-DD — decision — reason -->

- CSP uses `'unsafe-inline'` for scripts/styles (no nonce) to keep SSG; acceptable because there's no user-generated content or auth. Never `'unsafe-eval'` in production.
- HSTS without `preload` until the owner decides post-launch.
- MiniSearch over Pagefind to avoid static-export constraints (keeps headers + Server Actions).
- 2026-10-17 — Site name "Aiiman", domain `aiiman.dev`, byline "Ismail Idris" — owner choice; handle as brand, real name for E-E-A-T.
- 2026-10-17 — Vocabulary: Item (umbrella) = Entry (internal, own page) | Link (external, no page); see `GLOSSARY.md` — removes post/entry/item ambiguity.
- 2026-10-17 — Types split by folder: entries = essay|note|tutorial|snippet; links = video|podcast|talk|guest-post; wrong folder fails build — supersedes the single 7-value enum.
- 2026-10-17 — `featured` numbers unique across Items (build error on repeat); Links can be featured; project `featured` is boolean, `order` sorts; "Currently building" = featured projects of any status.
- 2026-10-17 — Only the Hausa Entry carries `translationOf` (→ English original); both appear separately; featured status not inherited.
- 2026-10-17 — Sitemap and `llms.txt` exclude Entries with an external `canonical` as well as `noindex`; archive/feeds/search keep them.
- 2026-10-17 — Scheduled publishing: future-dated Items hidden until their date in WAT (UTC+1); daily GitHub Action at 00:05 WAT calls a Vercel deploy hook — owner rejected "show immediately".
- 2026-10-17 — Vercel preview deploys show drafts + scheduled Items with a "Preview" banner (still fully noindex) — lets owner proof posts on phone.
- 2026-10-17 — `redirectFrom: [old-slug]` frontmatter generates permanent redirects in `next.config` — owner pre-approved this as the URL-change mechanism.
- 2026-10-17 — Share previews always use the generated OG card; `cover` renders on-page only — consistent WhatsApp/X previews.
- 2026-10-17 — Tag counts and tag pages include Links; tag indexed at ≥3 Items.
- 2026-10-17 — HSTS preload step dropped from handoff: `.dev` TLD is already HSTS-preloaded in browsers. Header still sent without `preload`.
- 2026-10-17 — Decisions recorded here only, no `docs/adr/` — single source of truth.
- 2026-10-17 — TypeScript pinned `~6.0.3`, not 7.x — `typescript-eslint` (via `eslint-config-next`) peer range is `<6.1.0`.
- 2026-10-17 — Velite run as separate script in build (`velite --clean` → search index → `next build`); dev watch started from `next.config.ts` — Velite docs: webpack plugin breaks under Turbopack; avoids `npm-run-all` dep.
- 2026-10-17 — `cacheComponents`/`partialPrefetching` removed from the create-next-app template config — Next 16 docs: exporting `dynamicParams` with `cacheComponents` fails the build, and the spec requires `dynamicParams = false` (pure SSG, real 404s without a function invocation).
- 2026-10-17 — Env split into `src/lib/env-schema.ts` (pure Zod schemas, unit-tested), `src/env.ts` (client-safe) and `src/env.server.ts` (`server-only`) — one `src/env.ts` can't be both client-importable and `server-only`.
- 2026-10-17 — Canonical origin = `NEXT_PUBLIC_SITE_URL` if set, else `siteConfig.url` — lets e2e run against localhost while production never needs the var.
- 2026-10-17 — ESLint kept on 9.x (template default) — eslint-config-next's bundled plugins are tested on 9; 10 adds no needed feature.
- 2026-10-17 — Dev deps `tsx` (run TS build scripts) and `fast-xml-parser` (parse feeds/sitemap in tests with a real parser) — required by the spec's script and XML-validation gates.
- 2026-10-17 — `remark-gfm` removed — Velite bundles GFM and enables it by default (`mdx.gfm`); adding it again would run the plugin twice.
- 2026-10-17 — Dev dep `@types/mdx` — official `MDXComponents` type for the component allowlist (types only).
- 2026-10-17 — Velite `copyLinkedFiles` off; own remark plugin (`src/lib/content/remark-content.ts`) copies colocated images via Velite's `processAsset` and stamps width/height/blur — the built-in copier records no dimensions, so `next/image` would have caused layout shift.
- 2026-10-17 — h1 and missing-alt checks run on the parsed mdast, not a `^# ` regex — the AST already excludes code fences, so no false positives.
- 2026-10-17 — Content script is `velite build --clean --strict` — the Velite CLI's `--strict` flag defaults to false and overrides `strict: true` in the config, so invalid content silently exited 0 without it. Dev watch stays non-strict so typos don't kill `next dev`.
- 2026-10-17 — Author review notes in MDX use `{/* REVIEW: … */}` not `<!-- -->` — MDX 3 cannot parse HTML comments. They're stripped from `raw` and `plainText` so they never reach search, `.md` routes or `llms.txt`.
- 2026-10-17 — Content logic lives in pure `src/lib/content/queries.ts` (unit-tested with fixtures); `src/lib/content.ts` is the `server-only` binding that injects mode + clock. Scheduled visibility is decided at build time, which is why the daily rebuild exists.
- 2026-10-17 — Search index built by a pure `buildSearchIndex()` used by both `scripts/build-search-index.ts` (prod build) and Velite's `complete` hook (dev only), so search stays fresh while writing.
- 2026-10-17 — Fonts: Charis SIL (serif: headings + prose) and Onest (sans: UI) — verified by reading the latin-ext woff2 subsets that next/font serves: both contain ɓ ɗ ƙ ƴ Ɓ Ɗ Ƙ Ƴ ʼ. Literata, Source Serif 4, Newsreader, Lora, Fraunces, IBM Plex Sans, Public Sans and most grotesques lack the hooked letters. Onest has no ₦ (prose/code carry it). Code uses the system monospace stack (two-family limit).
- 2026-10-17 — OG fonts: static TTFs in `src/assets/fonts/` (next/og can't read woff2), OFL licenses alongside; build-time only, never shipped to readers.
- 2026-10-17 — Palette: Kofar Mata indigo on cool paper; every text pair ≥ 6:1 in both themes. Inputs use the muted colour for borders (the rule colour is decorative only and fails 3:1).
- 2026-10-17 — `.prose-site` typography overrides are unlayered CSS — the typography plugin's `.prose` lives in the utilities layer and was overriding token colours (invisible body text in dark mode) and font size.
- 2026-10-17 — Theme switcher is a native `<select>` (Auto/Light/Dark) — gives light/dark/system with no menu code, fixed size (no CLS).
- 2026-10-17 — Desktop and mobile nav are one client island (`MainNav`) for `aria-current`; mobile menu open-state is keyed to the pathname, so navigation closes it without an effect.
- 2026-10-17 — Known low risk: Velite copies images of draft entries to `public/static` in production builds; filenames are content-hashed (unguessable) but technically reachable.
- 2026-10-18 — Archive filters run in place: server renders every row with `data-item-id`/`data-year`; the client island toggles `hidden` and writes the URL with `history.pushState`/`replaceState` (Next syncs it into `useSearchParams`) — no RSC round-trip per filter change, back button restores filters, full list works without JS.
- 2026-10-18 — E2E runs against fixture content (`tests/e2e/fixtures/content`) via `CONTENT_DIR` env read by `velite.config.ts`; `pnpm-workspace.yaml` sets `shellEmulator: true` so env-prefixed scripts work on Windows — tests never depend on real (draft) posts.
- 2026-10-18 — Date helpers split: pure `src/lib/dates.ts` (unit-testable, used by the search-index script) and `src/lib/format.ts` (`server-only` re-export for components) — the build script runs outside Next, where `server-only` throws.
- 2026-10-18 — Search index stores a server-formatted `dateLabel` — keeps "format dates on the server only" true for client search results.
- 2026-10-18 — Search dialog: native `<dialog>` + combobox/listbox ARIA, opens on ⌘K/Ctrl+K/`/` (ignored in fields); MiniSearch and the index load lazily on first open — zero search JS/bytes for readers who never search. Input is `type="text"` + `enterKeyHint="search"` to avoid a duplicate native clear button.
- 2026-10-18 — Form controls use a separate `<label htmlFor>` instead of wrapping labels — wrapping a `<select>` made the accessible name include every option's text.
- 2026-10-19 — SEO logic lives in pure, unit-tested builders under `src/lib/seo/` (`urls`, `metadata`, `jsonld`, `feeds`, `discovery`, `deploy`); route files only bind content + origin. `deploy.ts` is dependency-free so `next.config.ts` can import it.
- 2026-10-19 — Every page's metadata comes from `pageMetadata()`/`entryMetadata()`, which return canonical + feed alternates + OG + Twitter together — Next merges metadata shallowly, so a page that sets `alternates` or `openGraph` would otherwise drop the layout's feeds and OG defaults.
- 2026-10-19 — One `opengraph-image.tsx` per indexable route, rendered by a shared `renderOgCard()`. Entry and tag cards are single-image routes exporting their own `generateStaticParams` — with `generateImageMetadata`, Next's metadata loader never receives the parent `[slug]` params, so cards weren't prerendered (verified in `prerender-manifest.json`). Trade-off: one generic alt text per card type; og:title carries the post title.
- 2026-10-19 — No `twitter-image` files: Next copies the OG image, alt and size into `twitter:*` tags itself (verified in built HTML).
- 2026-10-19 — The 404 page sets no `robots` metadata: Next already injects `noindex` on not-found responses, and ours produced a duplicate tag.
- 2026-10-19 — Icons generated with next/og (`icon` 32/192/512 via `generateImageMetadata`, `apple-icon` 180); template `favicon.ico` and `public/window.svg` removed.
- 2026-10-19 — `/<slug>.md` = rewrite `/:slug([a-z0-9-]+)\.md` → route handler `src/app/md/[slug]` (force-static). Its `X-Robots-Tag: noindex` and `Link: rel="canonical"` headers survive static prerendering (verified with curl).
- 2026-10-19 — Non-production noindex is gated on `VERCEL_ENV` being set and not `production` (header in next.config + robots.txt `Disallow: /`). Local builds count as production so e2e tests real behaviour; preview behaviour verified with a `VERCEL_ENV=preview` build.
- 2026-10-19 — security.txt Contact = email → X profile → /about (email not provided yet); `Expires` 364 days out (RFC 9116 recommends under a year), refreshed by the daily rebuild.
- 2026-10-19 — llms.txt links each Entry's `.md` URL (llmstxt.org convention); feeds use the newest content date for `lastBuildDate` so output only changes when content does; Link items use the external URL as permalink/guid.
- 2026-10-19 — Security headers built by dependency-free `src/lib/security/headers.ts` (unit-tested), applied to `/:path*` in `next.config.ts`. Dev-only CSP additions: `'unsafe-eval'` (React Refresh) and `https://va.vercel-scripts.com` (Vercel Analytics/Speed Insights debug scripts); `upgrade-insecure-requests` dropped in dev. Production analytics load same-origin from `/_vercel/*` (checked in the installed packages' source), so the production CSP needs no extra origins.
- 2026-10-19 — `<Analytics />`/`<SpeedInsights />` render only when `VERCEL_ENV` is set — `/_vercel/*` exists only on Vercel, so local/e2e builds would log 404s.
- 2026-10-19 — Newsletter logic is pure `src/lib/newsletter/subscribe.ts` with injected rate limiter, provider and logger (unit-tested); `src/app/actions/newsletter.ts` binds env, `headers()` and Upstash. Form contract lives in zero-dependency `fields.ts` so Zod never reaches the client bundle.
- 2026-10-19 — Bot checks: honeypot + 3 s minimum time from a client-set timestamp. A missing timestamp is allowed (no-JS form posts); bots get the normal success message.
- 2026-10-19 — Buttondown: `POST https://api.buttondown.com/v1/subscribers`, `Authorization: Token …`, body `email_address` + `ip_address` (per docs.buttondown.com/api-subscribers-create); double opt-in kept (no `type: regular`) for consent. HTTP 400 (duplicate/suppressed) is shown to the reader as success so existence never leaks.
- 2026-10-19 — Upstash rate limit fails open (2 s timeout, errors logged) — an Upstash outage shouldn't block sign-ups; honeypot/timing still apply.
- 2026-10-19 — `scripts/check-bundle.ts` runs at the end of `pnpm build`: fails if a server secret value, `api.buttondown` or `upstash.io` appears in `.next/static`. Loads `.env*` with Node's `process.loadEnvFile` instead of adding `@next/env` as a dependency.
- 2026-10-20 — Shiki themes `github-light-high-contrast` / `github-dark-high-contrast` — the standard GitHub themes fail 4.5:1 on our code backgrounds (light red 4.13, orange 3.15; dark comments 3.51), caught by Lighthouse/axe.
- 2026-10-20 — No font preloads (`preload: false` on both families) — 10 preloaded woff2 files (~345 KB) competed with the render-blocking CSS on slow 4G (CSS took 0.85 s to arrive). Text paints immediately in next/font's metric-adjusted fallback; the faces actually used load at render time. CLS measured ≤ 0.001.
- 2026-10-20 — Reading measures in rem, not `ch` (`max-w-measure` = 45rem from `--container-measure`; prose 43rem) — `ch` follows the active font, so the column widened 637→724 px when web fonts swapped in (CLS 0.15 on desktop).
- 2026-10-20 — First image in an Entry's first 3 blocks gets `data-priority` from the remark plugin → `loading="eager"` + `fetchPriority="high"` (not the deprecated `priority`/`preload` link) — it is usually the LCP element; later images stay lazy for metered data.
- 2026-10-20 — Lighthouse runs locally via `pnpm dlx lighthouse@12.8.2` (no dependency added). Two local-measurement caveats: (1) with COOP + CSP both present, Lighthouse fails with `NO_NAVSTART` on localhost (bisected by stripping headers through a proxy; real browsers are unaffected), so lab runs strip COOP via a local proxy; (2) the dev machine's benchmarkIndex is ~1100–1400, so `--throttling.cpuSlowdownMultiplier=2` per Lighthouse's throttling docs (4× assumes a high-end desktop host). Authoritative numbers come from PageSpeed Insights on the production URL.
- 2026-10-20 — Reserved slugs now include generated metadata routes (`icon`, `apple-icon`, `opengraph-image`, `manifest.webmanifest`, `.well-known`); `tests/unit/routes.test.ts` derives every top-level route from `src/app` and fails if one isn't reserved — an Entry slug `icon` would have shadowed the favicon route.
- 2026-10-20 — CI (`.github/workflows/ci.yml`): one job — install → typecheck → lint → format:check → unit → real-content `pnpm build` (validates the owner's content) → `build:e2e` → Playwright → Lighthouse CI → `pnpm audit`. Single job because e2e and Lighthouse reuse the same `.next`.
- 2026-10-20 — Lighthouse CI via `pnpm dlx @lhci/cli@0.15.1` (no dependency) with `lighthouserc.json`: mobile, simulated slow 4G, median of 3 runs; fails on Perf < 95, A11y/BP/SEO < 100, LCP > 2 s, CLS > 0.05, TBT > 200 ms. Reports kept as a CI artifact (`filesystem` target) rather than LHCI's public temporary storage.
- 2026-10-20 — Scheduled publish: `.github/workflows/scheduled-publish.yml` at `5 23 * * *` UTC (00:05 WAT) POSTs the `VERCEL_DEPLOY_HOOK_URL` secret; skips with a warning when unset; `permissions: {}`.
- 2026-10-20 — Dependabot weekly: npm with minor+patch grouped (majors stay separate PRs for review), GitHub Actions grouped.
- 2026-10-20 — `typecheck` runs `pnpm content` first — `.velite/` is generated (gitignored), so a fresh clone (CI) had no `#velite` types; caught by the first CI run.
