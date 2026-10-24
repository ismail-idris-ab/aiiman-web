import {
  EMPTY_DOC,
  type Doc,
  type EntryType,
  type ImageInput,
  type Lang,
  type PostInput,
} from "@aiiman/shared";
import type { Post } from "./posts";

/** The editor's form state: every field as the input shows it. */
export interface Fields {
  title: string;
  slug: string;
  summary: string;
  type: EntryType;
  /** Comma-separated, as typed. */
  tags: string;
  lang: Lang;
  date: string;
  updated: string;
  featured: string;
  canonical: string;
  noindex: boolean;
  body: Doc;
  /** Alt as typed; the API trims it and requires it. */
  cover: ImageInput | null;
}

export const EMPTY_FIELDS: Fields = {
  title: "",
  slug: "",
  summary: "",
  type: "essay",
  tags: "",
  lang: "en",
  date: "",
  updated: "",
  featured: "",
  canonical: "",
  noindex: false,
  body: EMPTY_DOC,
  cover: null,
};

export function fieldsOf(post: Post): Fields {
  return {
    title: post.title,
    slug: post.slug,
    summary: post.summary,
    type: post.type,
    tags: post.tags.join(", "),
    lang: post.lang,
    date: post.date ?? "",
    updated: post.updated ?? "",
    featured: post.featured === undefined ? "" : String(post.featured),
    canonical: post.canonical ?? "",
    noindex: post.noindex,
    body: post.body,
    cover: post.cover ?? null,
  };
}

/** "web, React Native," → ["web", "react native"]; the API names any tag that breaks the rules. */
export function parseTags(text: string): string[] {
  return text
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => tag !== "");
}

const optional = (value: string) => {
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
};

/** Form state to API input. Empty optional fields are left out, which clears them. */
export function inputOf(fields: Fields): PostInput {
  const featured = optional(fields.featured);
  const date = optional(fields.date);
  const updated = optional(fields.updated);
  const canonical = optional(fields.canonical);
  return {
    title: fields.title,
    slug: fields.slug,
    summary: fields.summary,
    type: fields.type,
    tags: parseTags(fields.tags),
    lang: fields.lang,
    noindex: fields.noindex,
    body: fields.body,
    ...(date === undefined ? {} : { date }),
    ...(updated === undefined ? {} : { updated }),
    // A non-number becomes NaN, which JSON sends as null; the API rejects it with its own message.
    ...(featured === undefined ? {} : { featured: Number(featured) }),
    ...(canonical === undefined ? {} : { canonical }),
    ...(fields.cover === null ? {} : { cover: fields.cover }),
  };
}
