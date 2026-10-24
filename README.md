# Aiiman

Ismail Idris's public notebook at [aiiman.dev](https://aiiman.dev): one archive for essays, notes, tutorials and snippets, plus links to videos, podcasts, talks and guest posts published elsewhere. Written in MDX, built statically with Next.js, deployed on Vercel. Built to load fast on mobile and metered data, with complete technical SEO and no runtime backend apart from the newsletter sign-up.

The standing rules (stack, SEO, security, performance budgets, decisions log) live in [CLAUDE.md](CLAUDE.md). Vocabulary (Item, Entry, Link) is in [GLOSSARY.md](GLOSSARY.md).

## Repository layout

A pnpm workspace with three apps:

| App               | What it is                                                                  |
| ----------------- | --------------------------------------------------------------------------- |
| `apps/web`        | The public site (Next.js). Content currently lives in `apps/web/content`    |
| `apps/admin`      | Admin dashboard (Vite + React), being built — see PRD #3                    |
| `apps/api`        | Express API for the admin, backed by MongoDB                                |
| `packages/shared` | Content rules (slugs, post schema, Tiptap allowlist) used by all three apps |

Admin and API deploy together as one Vercel project (root `vercel.json`, Vercel Services); the site is its own Vercel project with Root Directory `apps/web`.

## Local setup

Requires Node 22+ and pnpm 11 (`corepack enable` picks up the version pinned in `package.json`).

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local   # optional: everything works with it empty
pnpm dev                                       # site at http://localhost:3000, drafts visible
```

Admin and API (optional for now): copy `apps/api/.env.example` to `apps/api/.env.local`, set `MONGODB_URI`, then `pnpm dev:admin` — admin at http://localhost:3002 (proxies `/api` to the API on port 3001).

## Publish a post in 3 steps

1. **Write** `apps/web/content/entries/<slug>/index.mdx` (or `apps/web/content/entries/<slug>.mdx` without images):

   ```mdx
   ---
   title: Why I build for the Arewa market first # 10–70 characters
   summary: One or two sentences, 50–160 characters. Becomes the meta description.
   date: 2026-10-20 # a future date publishes automatically that day (WAT)
   type: essay # essay | note | tutorial | snippet
   tags: [product, nigeria] # 1–5, kebab-case
   draft: true
   ---

   Start at `##`. The title is the page's only h1. Every image needs alt text.
   ```

2. **Preview** with `pnpm dev`, or push a branch: Vercel preview deploys show drafts with a "Preview" banner and are never indexed.
3. **Publish**: set `draft: false`, commit and push to `main`. Vercel deploys. The build fails with a message naming the file if anything is invalid.

External items (a video, podcast, talk or guest post) go in `apps/web/content/links/<slug>.mdx` with `externalUrl` (https). Projects are YAML in `apps/web/content/projects/`. Hausa posts set `lang: ha`; a translation sets `translationOf: <english-slug>`. Renaming a published slug: add `redirectFrom: [old-slug]`.

The build refuses to publish any Item while `apps/web/content/pages/about.mdx` or `privacy.mdx` is still a draft, because every page links to them.

## Commands

Run from the repo root: `dev`, `dev:admin`, `build`, `check`, `typecheck`, `lint`, `test`, `format`. The others run inside `apps/web`.

| Command          | What it does                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------ |
| `pnpm dev`       | Next dev server with Velite watching `content/`                                            |
| `pnpm content`   | Validate and compile all content (Velite, strict)                                          |
| `pnpm build`     | Content → search index → `next build` → secret-leak check                                  |
| `pnpm start`     | Serve the production build                                                                 |
| `pnpm check`     | Typecheck + lint + unit tests. Run before every commit                                     |
| `pnpm test`      | Unit tests (Vitest)                                                                        |
| `pnpm build:e2e` | Production build against the fixture content in `apps/web/tests/e2e/fixtures/content`      |
| `pnpm test:e2e`  | Playwright: SEO, accessibility (axe), security headers, performance. Run `build:e2e` first |
| `pnpm format`    | Prettier                                                                                   |

CI (`.github/workflows/ci.yml`) runs all of the above plus Lighthouse CI (mobile, slow 4G) and `pnpm audit` on every push and PR.

## Environment variables

All optional. Set them in Vercel → Project → Settings → Environment Variables (Production); locally in `apps/web/.env.local`. Never commit `.env*` files except `.env.example`.

| Variable                                              | Scope  | Effect                                                                                                                                               |
| ----------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BUTTONDOWN_API_KEY`                                  | server | Turns on the newsletter form. Unset: the form shows "coming soon"                                                                                    |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | server | Shared newsletter rate limit across instances. Unset: an in-memory limit per instance applies                                                        |
| `GOOGLE_SITE_VERIFICATION`                            | server | Content value of Google Search Console's HTML-tag verification                                                                                       |
| `BING_SITE_VERIFICATION`                              | server | Content value of Bing Webmaster Tools' `msvalidate.01` tag                                                                                           |
| `NEXT_PUBLIC_SITE_URL`                                | public | Overrides the canonical origin from `src/site.config.ts`. Leave unset in production; the e2e build sets it to localhost                              |
| `CONTENT_API_URL`                                     | server | Preview deploys and local builds add posts published in the admin, read from this API. Ignored in production until switch-over                       |
| `SITE_API_SECRET`                                     | server | 32+ random characters, same value as `SITE_API_SECRET` in the API. Authenticates `POST /api/revalidate` and verifies the admin's draft-preview links |
| `VERCEL_DEPLOY_HOOK_URL`                              | GitHub | **GitHub Actions secret**, not a Vercel variable. The daily rebuild that publishes future-dated posts POSTs it at 00:05 WAT                          |

`VERCEL_ENV` is set by Vercel itself: anything other than `production` makes the deploy fully `noindex`.

Site name, domain, author bio and social links live only in [`apps/web/src/site.config.ts`](apps/web/src/site.config.ts). `pnpm content` warns about fields still unset.

## Deploy notes

- **Vercel**: import the GitHub repo; framework preset Next.js; default build and install commands (`pnpm build`). Any Node version ≥ 22 works (`engines` in `package.json`).
- **Domain**: add `aiiman.dev` and `www.aiiman.dev`; make the apex primary and redirect `www` → apex (308).
- **Analytics**: enable Web Analytics and Speed Insights in the Vercel project. Their scripts load only on Vercel deploys and need no CSP changes.
- **Scheduled posts**: create a Deploy Hook (Settings → Git → Deploy Hooks, branch `main`) and save its URL as the `VERCEL_DEPLOY_HOOK_URL` GitHub secret. Without it, future-dated posts appear on the next push instead.
- **Security headers** (CSP, HSTS, COOP, …) are set in `next.config.ts` via `src/lib/security/headers.ts`. Don't weaken them; the e2e suite checks them.
