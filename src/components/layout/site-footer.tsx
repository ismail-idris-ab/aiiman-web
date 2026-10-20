import Link from "next/link";

import { getPage } from "@/lib/content";
import { siteConfig, type SocialKey } from "@/site.config";

const SOCIAL_LABELS: Record<SocialKey, string> = {
  x: "X",
  github: "GitHub",
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
  linkedin: "LinkedIn",
};

// `page` links show only once that page is published, so the footer never links to a 404.
const FOOTER_LINKS: ReadonlyArray<{
  href: string;
  label: string;
  page?: string;
}> = [
  { href: "/writing", label: "Writing" },
  { href: "/projects", label: "Projects" },
  { href: "/about", label: "About", page: "about" },
  { href: "/uses", label: "Uses", page: "uses" },
  { href: "/subscribe", label: "Subscribe" },
  { href: "/privacy", label: "Privacy", page: "privacy" },
];

export function SiteFooter() {
  const socials = (
    Object.entries(siteConfig.socials) as Array<[SocialKey, string | null]>
  ).filter((entry): entry is [SocialKey, string] => entry[1] !== null);
  const year = new Date().getUTCFullYear();

  return (
    <footer className="mt-24 border-t border-border">
      <div className="mx-auto grid max-w-5xl gap-8 px-4 py-10 text-sm text-muted sm:grid-cols-[1fr_auto_auto] sm:px-6">
        <p className="max-w-xs">
          © {year} {siteConfig.author.name}. Writing from{" "}
          {siteConfig.author.location}.
        </p>
        <nav aria-label="Footer">
          <ul className="grid grid-cols-2 gap-x-8 gap-y-2">
            {FOOTER_LINKS.filter(
              ({ page }) => page === undefined || getPage(page) !== undefined,
            ).map(({ href, label }) => (
              <li key={href}>
                <Link
                  href={href}
                  className="hover:text-foreground hover:underline"
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <ul className="flex flex-col gap-2" aria-label="Elsewhere">
          {socials.map(([key, url]) => (
            <li key={key}>
              <a
                href={url}
                rel="noopener noreferrer me"
                className="hover:text-foreground hover:underline"
              >
                {SOCIAL_LABELS[key]}
              </a>
            </li>
          ))}
          <li>
            <a
              href="/rss.xml"
              className="hover:text-foreground hover:underline"
            >
              RSS feed
            </a>
          </li>
          <li>
            <a
              href="/feed.json"
              className="hover:text-foreground hover:underline"
            >
              JSON feed
            </a>
          </li>
        </ul>
      </div>
    </footer>
  );
}
