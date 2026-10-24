/**
 * The only place for site-wide identity values: name, domain, author, socials.
 * Fields set to `null` are not provided yet; the content build warns until they are filled.
 */

export type SocialKey =
  "x" | "github" | "youtube" | "tiktok" | "instagram" | "facebook" | "linkedin";

export interface SiteConfig {
  name: string;
  domain: string;
  url: string;
  lang: "en";
  locale: string;
  timeZone: string;
  author: {
    name: string;
    jobTitle: string;
    bio: string;
    location: string;
    knowsAbout: readonly string[];
  };
  email: string | null;
  twitterHandle: `@${string}`;
  socials: Record<SocialKey, string | null>;
}

export const siteConfig: SiteConfig = {
  name: "Aiiman",
  domain: "aiiman.dev",
  url: "https://aiiman.dev",
  lang: "en",
  locale: "en-GB",
  timeZone: "Africa/Lagos",
  author: {
    name: "Ismail Idris",
    jobTitle: "Full-stack developer and product manager",
    bio: "Full-stack developer and product manager building production web and mobile apps for Nigerian and African markets.",
    location: "Northern Nigeria",
    knowsAbout: [
      "Full-stack web development",
      "Mobile app development",
      "Product management",
      "Next.js",
      "React Native",
    ],
  },
  email: "aiimanern001@gmail.com",
  twitterHandle: "@aiiman_ai",
  socials: {
    x: "https://x.com/aiiman_ai",
    github: "https://github.com/ismail-idris-ab",
    youtube: null,
    tiktok: "https://www.tiktok.com/@aiiman.ai",
    instagram: "https://www.instagram.com/aiiman001.ai",
    facebook: "https://www.facebook.com/profile.php?id=61591573653599",
    linkedin: null,
  },
};

/** Names of identity fields still missing, for build-time warnings. */
export function missingSiteConfigFields(
  config: SiteConfig = siteConfig,
): string[] {
  const missing: string[] = [];
  if (config.email === null) missing.push("email");
  for (const [key, value] of Object.entries(config.socials)) {
    if (value === null) missing.push(`socials.${key}`);
  }
  return missing;
}
