/**
 * Embeds: a pasted URL becomes a typed descriptor (provider and IDs) or a
 * message saying why it can't be embedded. Only the IDs are kept; every URL
 * the site uses (the iframe, the "open on…" link) is rebuilt from them, so a
 * stored embed can't point anywhere else. Dependency-free.
 */

export const EMBED_PROVIDERS = [
  "youtube",
  "x",
  "tiktok",
  "instagram",
  "gist",
] as const;
export type EmbedProvider = (typeof EMBED_PROVIDERS)[number];

export const EMBED_PROVIDER_NAMES: Record<EmbedProvider, string> = {
  youtube: "YouTube",
  x: "X",
  tiktok: "TikTok",
  instagram: "Instagram",
  gist: "GitHub Gist",
};

export type Embed =
  | { provider: "youtube"; id: string }
  | { provider: "x"; user: string; id: string }
  | { provider: "tiktok"; user: string; id: string }
  | { provider: "instagram"; kind: "p" | "reel"; id: string }
  | { provider: "gist"; user: string; id: string };

export type EmbedResult =
  { ok: true; embed: Embed } | { ok: false; error: string };

/** Origins the iframes load from after a tap: the site's CSP `frame-src`, nothing else. */
export const EMBED_FRAME_ORIGINS = [
  "https://www.youtube-nocookie.com",
  "https://platform.twitter.com",
  "https://www.tiktok.com",
  "https://www.instagram.com",
  "https://gist.github.com",
] as const;

export const UNSUPPORTED_EMBED =
  "Only YouTube, X, TikTok, Instagram and GitHub Gist links can be embedded.";

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const X_USER = /^[A-Za-z0-9_]{1,15}$/;
const DIGITS = /^\d{1,20}$/;
const TIKTOK_USER = /^[A-Za-z0-9._]{1,30}$/;
const INSTAGRAM_CODE = /^[A-Za-z0-9_-]{5,40}$/;
const GITHUB_USER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const GIST_ID = /^[0-9a-f]{20,40}$/i;

const HOSTS: Record<string, EmbedProvider> = {
  "youtube.com": "youtube",
  "www.youtube.com": "youtube",
  "m.youtube.com": "youtube",
  "youtu.be": "youtube",
  "youtube-nocookie.com": "youtube",
  "www.youtube-nocookie.com": "youtube",
  "x.com": "x",
  "www.x.com": "x",
  "mobile.x.com": "x",
  "twitter.com": "x",
  "www.twitter.com": "x",
  "mobile.twitter.com": "x",
  "tiktok.com": "tiktok",
  "www.tiktok.com": "tiktok",
  "m.tiktok.com": "tiktok",
  "vm.tiktok.com": "tiktok",
  "vt.tiktok.com": "tiktok",
  "instagram.com": "instagram",
  "www.instagram.com": "instagram",
  "gist.github.com": "gist",
};

const NOT_A: Record<EmbedProvider, string> = {
  youtube: "That YouTube link doesn't point to a video.",
  x: "That X link doesn't point to a post. Copy the post's link (x.com/name/status/…).",
  tiktok:
    "That TikTok link doesn't point to a video. Copy the video's address (tiktok.com/@name/video/…).",
  instagram: "That Instagram link doesn't point to a post or reel.",
  gist: "That GitHub link doesn't point to a gist (gist.github.com/name/…).",
};

const fail = (error: string): EmbedResult => ({ ok: false, error });
const ok = (embed: Embed): EmbedResult => ({ ok: true, embed });

function youtube(url: URL, segments: string[]): EmbedResult {
  const [first, second] = segments;
  const id =
    url.hostname === "youtu.be"
      ? first
      : first === "watch"
        ? (url.searchParams.get("v") ?? undefined)
        : first === "shorts" || first === "embed" || first === "live"
          ? second
          : undefined;
  return id !== undefined && YOUTUBE_ID.test(id)
    ? ok({ provider: "youtube", id })
    : fail(NOT_A.youtube);
}

function x(segments: string[]): EmbedResult {
  const [user, status, id] = segments;
  return user !== undefined &&
    X_USER.test(user) &&
    user !== "i" &&
    status === "status" &&
    id !== undefined &&
    DIGITS.test(id)
    ? ok({ provider: "x", user, id })
    : fail(NOT_A.x);
}

function tiktok(url: URL, segments: string[]): EmbedResult {
  if (url.hostname === "vm.tiktok.com" || url.hostname === "vt.tiktok.com") {
    return fail(
      "Short TikTok links can't be embedded. Open the video and copy the address from the browser (tiktok.com/@name/video/…).",
    );
  }
  const [handle, video, id] = segments;
  const user = handle?.startsWith("@") ? handle.slice(1) : undefined;
  return user !== undefined &&
    TIKTOK_USER.test(user) &&
    video === "video" &&
    id !== undefined &&
    DIGITS.test(id)
    ? ok({ provider: "tiktok", user, id })
    : fail(NOT_A.tiktok);
}

function instagram(segments: string[]): EmbedResult {
  // instagram.com/p/CODE, /reel/CODE, /tv/CODE, or /name/p/CODE.
  const index = segments.findIndex((part) =>
    ["p", "reel", "reels", "tv"].includes(part),
  );
  const kindPart = segments[index];
  const id = segments[index + 1];
  if (index > 1 || kindPart === undefined || id === undefined) {
    return fail(NOT_A.instagram);
  }
  const kind = kindPart === "reel" || kindPart === "reels" ? "reel" : "p";
  return INSTAGRAM_CODE.test(id)
    ? ok({ provider: "instagram", kind, id })
    : fail(NOT_A.instagram);
}

function gist(segments: string[]): EmbedResult {
  const [user, rawId] = segments;
  const id = rawId?.replace(/\.js$/, "");
  return user !== undefined &&
    GITHUB_USER.test(user) &&
    id !== undefined &&
    GIST_ID.test(id)
    ? ok({ provider: "gist", user, id: id.toLowerCase() })
    : fail(NOT_A.gist);
}

/** A pasted URL (with or without https://) → an embed, or why it can't be one. */
export function resolveEmbed(input: string): EmbedResult {
  const text = input.trim();
  if (text === "" || text.length > 2048 || /\s/.test(text)) {
    return fail("Paste the link to a post or video.");
  }
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`);
  } catch {
    return fail("That isn't a link. Paste the full address.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return fail(UNSUPPORTED_EMBED);
  }
  const provider = Object.hasOwn(HOSTS, url.hostname)
    ? HOSTS[url.hostname]
    : undefined;
  if (provider === undefined || url.username !== "" || url.password !== "") {
    return fail(UNSUPPORTED_EMBED);
  }
  const segments = url.pathname.split("/").filter((part) => part !== "");
  switch (provider) {
    case "youtube":
      return youtube(url, segments);
    case "x":
      return x(segments);
    case "tiktok":
      return tiktok(url, segments);
    case "instagram":
      return instagram(segments);
    case "gist":
      return gist(segments);
  }
}

/** The public page for the embed: the stored form and the "open on…" link. */
export function embedUrl(embed: Embed): string {
  switch (embed.provider) {
    case "youtube":
      return `https://www.youtube.com/watch?v=${embed.id}`;
    case "x":
      return `https://x.com/${embed.user}/status/${embed.id}`;
    case "tiktok":
      return `https://www.tiktok.com/@${embed.user}/video/${embed.id}`;
    case "instagram":
      return `https://www.instagram.com/${embed.kind}/${embed.id}/`;
    case "gist":
      return `https://gist.github.com/${embed.user}/${embed.id}`;
  }
}

/** What the iframe loads after the reader taps; every origin is in EMBED_FRAME_ORIGINS. */
export function embedFrameSrc(embed: Embed): string {
  switch (embed.provider) {
    case "youtube":
      return `https://www.youtube-nocookie.com/embed/${embed.id}?autoplay=1`;
    case "x":
      return `https://platform.twitter.com/embed/Tweet.html?id=${embed.id}&dnt=true`;
    case "tiktok":
      return `https://www.tiktok.com/player/v1/${embed.id}`;
    case "instagram":
      return `https://www.instagram.com/${embed.kind}/${embed.id}/embed/`;
    case "gist":
      // The gist as a plain page: no script, and GitHub allows framing it.
      return `https://gist.github.com/${embed.user}/${embed.id}.pibb`;
  }
}

/** A title when the writer gives none: names the provider and author. */
export function embedLabel(embed: Embed): string {
  switch (embed.provider) {
    case "youtube":
      return "YouTube video";
    case "x":
      return `Post by @${embed.user} on X`;
    case "tiktok":
      return `TikTok video by @${embed.user}`;
    case "instagram":
      return embed.kind === "reel" ? "Instagram reel" : "Instagram post";
    case "gist":
      return `GitHub Gist by ${embed.user}`;
  }
}
