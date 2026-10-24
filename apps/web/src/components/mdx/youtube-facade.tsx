"use client";

import Image from "next/image";
import { useState } from "react";

/**
 * Lite YouTube embed: a thumbnail and play button until the reader asks for
 * the video, so no YouTube scripts load on page view.
 */
export function YouTubeFacade({ id, title }: { id: string; title: string }) {
  const [playing, setPlaying] = useState(false);

  return (
    <div className="not-prose relative my-6 aspect-video overflow-hidden rounded-lg bg-black">
      {playing ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1`}
          title={title}
          className="absolute inset-0 h-full w-full"
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-presentation"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          className="group absolute inset-0 h-full w-full"
        >
          <Image
            src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`}
            alt=""
            fill
            sizes="(min-width: 768px) 43rem, 100vw"
            className="object-cover opacity-90 transition-opacity group-hover:opacity-100"
          />
          <span className="absolute inset-0 m-auto flex h-14 w-20 items-center justify-center rounded-xl bg-black/80 text-white">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-7 w-7 fill-current"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
          <span className="sr-only">Play video: {title}</span>
        </button>
      )}
    </div>
  );
}
