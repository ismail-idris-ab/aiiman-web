import type { MDXComponents } from "mdx/types";
import Image from "next/image";
import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { siteConfig } from "@/site.config";

import { CopyButton } from "./copy-button";
import { YouTubeFacade } from "./youtube-facade";

const PROSE_IMAGE_SIZES = "(min-width: 768px) 68ch, 100vw";

function isExternal(href: string): boolean {
  if (!/^https?:\/\//i.test(href)) return false;
  return new URL(href).hostname !== siteConfig.domain;
}

function MdxLink({
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

type MdxImageProps = ComponentPropsWithoutRef<"img"> & { "data-blur"?: string };

/** Colocated images arrive with width, height and a blur placeholder from the content build. */
function MdxImage({
  src,
  alt,
  width,
  height,
  "data-blur": blur,
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
      {...(blur === undefined
        ? {}
        : { placeholder: "blur" as const, blurDataURL: blur })}
    />
  );
}

function Callout({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <aside
      className="not-prose border-border bg-muted/40 my-6 rounded-lg border px-5 py-4"
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

function YouTube({ id, title }: { id: string; title: string }) {
  if (!YOUTUBE_ID.test(id))
    throw new Error(`<YouTube> id "${id}" is not a valid video ID.`);
  if (title.trim() === "")
    throw new Error("<YouTube> needs a descriptive title.");
  return <YouTubeFacade id={id} title={title} />;
}

function Pre(props: ComponentPropsWithoutRef<"pre">) {
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
};
