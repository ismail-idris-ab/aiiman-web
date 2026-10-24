import type { Options as PrettyCodeOptions } from "rehype-pretty-code";

/**
 * Code highlighting for MDX (velite.config.ts) and admin posts
 * (`highlightCodeBlocks`), so both render identical markup. High-contrast
 * themes: the standard GitHub ones fail 4.5:1 on our code backgrounds.
 */
export const prettyCodeOptions: PrettyCodeOptions = {
  theme: {
    light: "github-light-high-contrast",
    dark: "github-dark-high-contrast",
  },
  keepBackground: false,
  defaultLang: "plaintext",
};
