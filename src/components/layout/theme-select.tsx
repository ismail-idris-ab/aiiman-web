"use client";

import { useTheme } from "next-themes";

/**
 * Native select: accessible by default, no menu code, and a fixed size so the
 * header never shifts. The stored theme is only known after hydration, hence
 * `suppressHydrationWarning` on the value.
 */
export function ThemeSelect() {
  const { theme, setTheme } = useTheme();

  return (
    <label className="relative inline-flex h-9 items-center">
      <span className="sr-only">Colour theme</span>
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        className="pointer-events-none absolute left-2 h-4 w-4 text-muted"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
      >
        <circle cx="8" cy="8" r="5.5" />
        <path d="M8 2.5v11a5.5 5.5 0 0 0 0-11z" fill="currentColor" />
      </svg>
      <select
        value={theme ?? "system"}
        onChange={(event) => setTheme(event.target.value)}
        suppressHydrationWarning
        className="h-9 cursor-pointer appearance-none rounded-md border border-muted/50 bg-background pr-2 pl-7 text-sm text-foreground hover:border-muted"
      >
        <option value="system">Auto</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}
