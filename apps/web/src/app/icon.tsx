import { OG_CONTENT_TYPE, renderIcon } from "@/lib/seo/og-card";

/** Favicon (32) plus the sizes the web manifest needs (192, 512). */
const ICON_SIZES = [32, 192, 512] as const;

export function generateImageMetadata() {
  return ICON_SIZES.map((px) => ({
    id: String(px),
    size: { width: px, height: px },
    contentType: OG_CONTENT_TYPE,
  }));
}

export default async function Icon({ id }: { id: Promise<string> }) {
  return renderIcon(Number(await id));
}
