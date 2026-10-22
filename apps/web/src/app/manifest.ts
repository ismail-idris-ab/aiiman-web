import type { MetadataRoute } from "next";

import { siteConfig } from "@/site.config";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${siteConfig.name} · ${siteConfig.author.name}`,
    short_name: siteConfig.name,
    description: siteConfig.author.bio,
    lang: siteConfig.lang,
    start_url: "/",
    display: "standalone",
    background_color: "#fbfbf8",
    theme_color: "#fbfbf8",
    icons: [
      { src: "/icon/192", sizes: "192x192", type: "image/png" },
      { src: "/icon/512", sizes: "512x512", type: "image/png" },
    ],
  };
}
