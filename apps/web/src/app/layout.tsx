import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata, Viewport } from "next";
import { Charis_SIL, Onest } from "next/font/google";

import { PreviewBanner } from "@/components/layout/preview-banner";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { SearchDialog } from "@/components/search/search-dialog";
import { siteUrl } from "@/env";
import { serverEnv } from "@/env.server";
import { feedAlternates, TITLE_TEMPLATE } from "@/lib/seo/metadata";
import { siteConfig } from "@/site.config";

import "./globals.css";

/*
 * Both families verified to contain the Hausa hooked letters ɓ ɗ ƙ ƴ (and capitals) in latin-ext.
 *
 * display: optional, no preload — the web font is used only if it is ready at first
 * paint (e.g. cached), so text never reflows mid-read. With "swap", Android/Linux
 * (no Arial/Times New Roman for next/font's size-matched fallback) shifted 0.05–0.12.
 * Preloading all faces (~345 KB) delayed the CSS on slow 4G.
 */
const charis = Charis_SIL({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  variable: "--font-charis",
  display: "optional",
  preload: false,
});

const onest = Onest({
  subsets: ["latin", "latin-ext"],
  variable: "--font-onest",
  display: "optional",
  preload: false,
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: `${siteConfig.author.name} · ${siteConfig.name}`,
    template: TITLE_TEMPLATE,
  },
  description: siteConfig.author.bio,
  authors: [{ name: siteConfig.author.name, url: `${siteUrl}/about` }],
  // No canonical here: each page sets its own, and the 404 page must have none.
  alternates: { types: feedAlternates },
  openGraph: { siteName: siteConfig.name, locale: "en_GB", type: "website" },
  twitter: {
    card: "summary_large_image",
    site: siteConfig.twitterHandle,
    creator: siteConfig.twitterHandle,
  },
  verification: {
    ...(serverEnv.GOOGLE_SITE_VERIFICATION === undefined
      ? {}
      : { google: serverEnv.GOOGLE_SITE_VERIFICATION }),
    ...(serverEnv.BING_SITE_VERIFICATION === undefined
      ? {}
      : { other: { "msvalidate.01": serverEnv.BING_SITE_VERIFICATION } }),
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfbf8" },
    { media: "(prefers-color-scheme: dark)", color: "#121521" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang={siteConfig.lang}
      className={`${charis.variable} ${onest.variable}`}
      suppressHydrationWarning
    >
      <body className="flex min-h-dvh flex-col antialiased">
        <ThemeProvider>
          <a
            href="#main"
            className="sr-only z-50 rounded-md bg-background px-4 py-2 text-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
          >
            Skip to content
          </a>
          <PreviewBanner />
          <SiteHeader search={<SearchDialog />} />
          <main
            id="main"
            tabIndex={-1}
            className="mx-auto w-full max-w-5xl flex-1 px-4 pt-10 sm:px-6 sm:pt-14"
          >
            {children}
          </main>
          <SiteFooter />
        </ThemeProvider>
        {/* Cookieless; scripts are served same-origin from /_vercel/*, which exists only on Vercel. */}
        {serverEnv.VERCEL_ENV === undefined ? null : (
          <>
            <Analytics />
            <SpeedInsights />
          </>
        )}
      </body>
    </html>
  );
}
