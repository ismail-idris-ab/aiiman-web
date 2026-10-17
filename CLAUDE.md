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
