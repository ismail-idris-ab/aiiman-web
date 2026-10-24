"use client";

import { useState, type MouseEvent } from "react";

/** Copies the text of the sibling <pre>. Rendered inside the code block wrapper. */
export function CopyButton() {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  async function copy(event: MouseEvent<HTMLButtonElement>) {
    const code =
      event.currentTarget.parentElement?.querySelector("pre")?.textContent ??
      "";
    try {
      await navigator.clipboard.writeText(code);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
    window.setTimeout(() => setStatus("idle"), 2000);
  }

  return (
    <>
      <button
        type="button"
        onClick={copy}
        className="absolute top-2 right-2 min-h-8 rounded-md border border-border bg-background px-2 text-xs opacity-80 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
      >
        {status === "copied" ? "Copied" : "Copy"}
        <span className="sr-only"> code to clipboard</span>
      </button>
      <span className="sr-only" aria-live="polite">
        {status === "copied"
          ? "Code copied"
          : status === "failed"
            ? "Copy failed"
            : ""}
      </span>
    </>
  );
}
