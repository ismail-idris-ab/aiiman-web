import type { MDXComponents } from "mdx/types";
import Image from "next/image";
import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { resolveEmbed } from "@aiiman/shared/embed";

import { EmbedBlock } from "@/components/post/embed-block";
import { siteConfig } from "@/site.config";

import { CopyButton } from "./copy-button";
import { YouTubeFacade } from "./youtube-facade";

const PROSE_IMAGE_SIZES = "(min-width: 768px) 43rem, 100vw";

function isExternal(href: string): boolean {
  // Protocol-relative "//host" leaves the site even though it starts with "/".
  if (href.startsWith("//")) return true;
  if (!/^https?:\/\//i.test(href)) return false;
  return new URL(href).hostname !== siteConfig.domain;
}

export function MdxLink({
  href = "",
  children,
  ...props
}: ComponentPropsWithoutRef<"a">) {
  if (isExternal(href)) {
    return (
      <a href={href} rel="noopener noreferrer" {...props}>
        {children}
        <span aria-hidden="true">&nbsp;↗</span>
        <span className="sr-only"> (external link)</span>
      </a>
    );
  }
  if (href.startsWith("/")) {
    return (
      <Link href={href} {...props}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} {...props}>
      {children}
    </a>
  );
}

export type MdxImageProps = ComponentPropsWithoutRef<"img"> & {
  "data-blur"?: string;
  "data-priority"?: string;
};

/**
 * Colocated images arrive with width, height and a blur placeholder from the
 * content build. An image near the top of the body is flagged `data-priority`
 * and loads eagerly at high priority (it is usually the LCP element).
 * Admin post images render through it too.
 */
export function MdxImage({
  src,
  alt,
  width,
  height,
  "data-blur": blur,
  "data-priority": priority,
  title,
}: MdxImageProps) {
  const w = Number(width);
  const h = Number(height);
  if (
    typeof src !== "string" ||
    !Number.isFinite(w) ||
    !Number.isFinite(h) ||
    w <= 0 ||
    h <= 0
  ) {
    throw new Error(
      `MDX image "${String(src)}" is missing dimensions; use a colocated relative image path.`,
    );
  }
  return (
    <Image
      src={src}
      alt={alt ?? ""}
      width={w}
      height={h}
      title={title}
      sizes={PROSE_IMAGE_SIZES}
      {...(priority === "true"
        ? { loading: "eager" as const, fetchPriority: "high" as const }
        : {})}
      {...(blur === undefined
        ? {}
        : { placeholder: "blur" as const, blurDataURL: blur })}
    />
  );
}

export function Callout({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <aside
      className="not-prose my-6 rounded-lg border border-border bg-accent-soft px-5 py-4"
      role="note"
    >
      {title === undefined ? null : (
        <p className="mb-1 font-semibold">{title}</p>
      )}
      <div className="text-[0.95em] leading-relaxed">{children}</div>
    </aside>
  );
}

const YOUTUBE_ID = /^[\w-]{11}$/;

/** `<Embed url="https://x.com/…/status/…" title="…" />`: any link the admin can embed. */
function Embed({ url, title }: { url: string; title?: string }) {
  const resolved = resolveEmbed(url);
  if (!resolved.ok) throw new Error(`<Embed> url "${url}": ${resolved.error}`);
  return <EmbedBlock embed={resolved.embed} title={title} />;
}

function YouTube({ id, title }: { id: string; title: string }) {
  if (!YOUTUBE_ID.test(id))
    throw new Error(`<YouTube> id "${id}" is not a valid video ID.`);
  if (title.trim() === "")
    throw new Error("<YouTube> needs a descriptive title.");
  return <YouTubeFacade id={id} title={title} />;
}

/** A code block with its copy button; shared by MDX and admin posts. */
export function Pre(props: ComponentPropsWithoutRef<"pre">) {
  return (
    <div className="group relative">
      <pre {...props} />
      <CopyButton />
    </div>
  );
}

export const mdxComponents: MDXComponents = {
  a: MdxLink,
  img: MdxImage,
  pre: Pre,
  Image: MdxImage,
  Callout,
  YouTube,
  Embed,
};

function LazyMdxImage(props: MdxImageProps) {
  return <MdxImage {...props} data-priority={undefined} />;
}

export const mdxComponentsLazyImages: MDXComponents = {
  ...mdxComponents,
  img: LazyMdxImage,
  Image: LazyMdxImage,
};
