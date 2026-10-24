"use client";

import { useState } from "react";

/** Frame size per provider, fixed so loading the embed never moves the page afterwards. */
const FRAME_CLASS = {
  x: "h-[28rem] w-full",
  tiktok: "mx-auto aspect-[9/16] w-full max-w-[21rem]",
  instagram: "h-[42rem] w-full",
  gist: "h-96 w-full",
} as const;

export type FramedProvider = keyof typeof FRAME_CLASS;

/**
 * A third-party post as a box with a load button. Nothing is requested from
 * the provider until the reader taps; then a sandboxed iframe loads from an
 * origin in the CSP's frame-src. YouTube uses its own thumbnail facade.
 */
export function EmbedFacade({
  provider,
  providerName,
  title,
  url,
  frameSrc,
}: {
  provider: FramedProvider;
  providerName: string;
  title: string;
  url: string;
  frameSrc: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const host = new URL(frameSrc).host;

  return (
    <figure className="not-prose my-6 overflow-hidden rounded-lg border border-border">
      {loaded ? (
        <iframe
          // The button the reader tapped is gone; keep their place on the page.
          ref={(frame) => frame?.focus()}
          src={frameSrc}
          title={title}
          className={`block ${FRAME_CLASS[provider]}`}
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
        />
      ) : (
        <div className="space-y-3 p-4">
          <p className="font-medium">{title}</p>
          <p className="text-sm text-muted">
            Loads content from {host}, which may set cookies.
          </p>
          <button
            type="button"
            onClick={() => setLoaded(true)}
            className="min-h-11 rounded-md bg-accent px-4 py-2 text-sm font-medium text-background hover:opacity-90"
          >
            Load {providerName} embed
            <span className="sr-only">: {title}</span>
          </button>
        </div>
      )}
      <figcaption className="border-t border-border px-4 py-2 text-sm">
        <a href={url} rel="noopener noreferrer" className="underline">
          Open on {providerName}
        </a>
      </figcaption>
    </figure>
  );
}
