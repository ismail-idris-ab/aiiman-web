import { OG_CONTENT_TYPE, renderIcon } from "@/lib/seo/og-card";

export const size = { width: 180, height: 180 };
export const contentType = OG_CONTENT_TYPE;

export default function AppleIcon() {
  return renderIcon(size.width);
}
