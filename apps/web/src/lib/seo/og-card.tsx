/**
 * Share card renderer for every `opengraph-image` route. Rendered at build
 * time with local TTFs (next/og can't read woff2); both fonts contain the
 * Hausa hooked letters ɓ ɗ ƙ ƴ and ʼ. Always the light palette: previews in
 * WhatsApp and X sit on varied backgrounds, and indigo on paper reads on all.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

import { siteConfig } from "@/site.config";

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = "image/png";

const COLORS = {
  paper: "#fbfbf8",
  ink: "#1b1e2e",
  muted: "#545a70",
  indigo: "#2e3d8f",
  indigoSoft: "#e8ebf7",
} as const;

const FONT_DIR = join(process.cwd(), "src/assets/fonts");

let fontsPromise:
  | Promise<
      Array<{
        name: string;
        data: Buffer;
        weight: 500 | 700;
        style: "normal";
      }>
    >
  | undefined;

function loadFonts() {
  fontsPromise ??= Promise.all([
    readFile(join(FONT_DIR, "charis-sil-700.ttf")),
    readFile(join(FONT_DIR, "onest-500.ttf")),
  ]).then(([serif, sans]) => [
    { name: "Charis SIL", data: serif, weight: 700, style: "normal" },
    { name: "Onest", data: sans, weight: 500, style: "normal" },
  ]);
  return fontsPromise;
}

/** Shrinks long titles so they fit in three lines at 1040px wide. */
export function titleFontSize(title: string): number {
  const length = [...title].length;
  if (length <= 24) return 88;
  if (length <= 44) return 76;
  if (length <= 64) return 64;
  return 56;
}

/** The relief-band motif from the site header, as a standalone SVG data URI. */
const RELIEF_BAND = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="24" viewBox="0 0 600 12"><defs><pattern id="r" width="24" height="12" patternUnits="userSpaceOnUse"><path d="M0 11 6 1l6 10 6-10 6 10" fill="none" stroke="${COLORS.indigo}" stroke-width="1.25"/><path d="M6 6 8 8.5 6 11 4 8.5Z" fill="${COLORS.indigo}"/><path d="M18 5 20 7.5 18 10 16 7.5Z" fill="none" stroke="${COLORS.indigo}"/></pattern></defs><rect width="600" height="12" fill="url(#r)"/></svg>`,
)}`;

export interface OgCard {
  title: string;
  /** Short label shown as a badge, e.g. the Item type ("Tutorial"). */
  badge?: string;
  /** Secondary line under the title (a summary or the bio). */
  subtitle?: string;
  /** Footer detail next to the byline, e.g. a formatted date. */
  meta?: string;
  /** Hide the author byline (the home card already shows the name as its title). */
  hideByline?: boolean;
}

export async function renderOgCard({
  title,
  badge,
  subtitle,
  meta,
  hideByline = false,
}: OgCard): Promise<ImageResponse> {
  const fonts = await loadFonts();
  const size = titleFontSize(title);

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: COLORS.paper,
        color: COLORS.ink,
        fontFamily: "Onest",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- next/og renders <img>, not next/image */}
      <img src={RELIEF_BAND} width={1200} height={24} alt="" />
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          padding: "52px 80px 56px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 30,
          }}
        >
          <span
            style={{
              fontFamily: "Charis SIL",
              fontSize: 40,
              color: COLORS.indigo,
            }}
          >
            {siteConfig.name}
          </span>
          {badge === undefined ? null : (
            <span
              style={{
                padding: "6px 20px",
                borderRadius: 999,
                background: COLORS.indigoSoft,
                color: COLORS.indigo,
              }}
            >
              {badge}
            </span>
          )}
        </div>

        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              display: "block",
              fontFamily: "Charis SIL",
              fontSize: size,
              lineHeight: 1.12,
              letterSpacing: "-0.01em",
              lineClamp: 3,
            }}
          >
            {title}
          </div>
          {subtitle === undefined ? null : (
            <div
              style={{
                display: "block",
                marginTop: 24,
                fontSize: 32,
                lineHeight: 1.35,
                color: COLORS.muted,
                lineClamp: 2,
              }}
            >
              {subtitle}
            </div>
          )}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 28,
            color: COLORS.muted,
          }}
        >
          <span style={{ display: "flex", gap: 24 }}>
            {hideByline ? null : (
              <span style={{ color: COLORS.ink }}>
                {siteConfig.author.name}
              </span>
            )}
            {meta === undefined ? null : <span>{meta}</span>}
          </span>
          <span>{siteConfig.domain}</span>
        </div>
      </div>
    </div>,
    { ...OG_SIZE, fonts },
  );
}

/** App icon: the site initial in Charis SIL on indigo. Square, full-bleed (no baked-in rounding). */
export async function renderIcon(px: number): Promise<ImageResponse> {
  const fonts = await loadFonts();
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: COLORS.indigo,
        color: COLORS.paper,
        fontFamily: "Charis SIL",
        fontSize: Math.round(px * 0.68),
        lineHeight: 1,
        paddingBottom: Math.round(px * 0.04),
      }}
    >
      {siteConfig.name.charAt(0)}
    </div>,
    { width: px, height: px, fonts },
  );
}
