"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useState, type KeyboardEvent } from "react";

const NAV_LINKS = [
  { href: "/writing", label: "Writing" },
  { href: "/projects", label: "Projects" },
  { href: "/about", label: "About" },
  { href: "/subscribe", label: "Subscribe" },
] as const;

const isCurrent = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`);

/**
 * Main navigation: inline links from md up, a disclosure menu below.
 * The menu's open state is tied to the pathname it was opened on, so any
 * navigation (link, back button) closes it without an effect.
 */
export function MainNav() {
  const pathname = usePathname();
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const menuId = useId();
  const buttonId = `${menuId}-button`;

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape" && open) {
      setOpenOn(null);
      document.getElementById(buttonId)?.focus();
    }
  }

  const links = (itemClass: string) =>
    NAV_LINKS.map(({ href, label }) => (
      <li key={href}>
        <Link
          href={href}
          aria-current={isCurrent(pathname, href) ? "page" : undefined}
          onClick={() => setOpenOn(null)}
          className={itemClass}
        >
          {label}
        </Link>
      </li>
    ));

  return (
    <>
      <nav aria-label="Main" className="hidden md:block">
        <ul className="flex items-center gap-6">
          {links(
            "py-2 text-foreground underline-offset-[6px] hover:underline aria-[current=page]:text-accent aria-[current=page]:underline aria-[current=page]:decoration-2",
          )}
        </ul>
      </nav>

      <div className="md:hidden" onKeyDown={onKeyDown}>
        <button
          id={buttonId}
          type="button"
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => setOpenOn(open ? null : pathname)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-muted/50 text-foreground"
        >
          <span className="sr-only">Menu</span>
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            {open ? (
              <path d="m4 4 8 8M12 4l-8 8" />
            ) : (
              <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" />
            )}
          </svg>
        </button>
        <nav
          id={menuId}
          aria-label="Main"
          hidden={!open}
          className="absolute inset-x-0 top-full z-20 border-b border-border bg-background px-4 pb-4 shadow-sm"
        >
          <ul className="flex flex-col">
            {links(
              "block py-3 text-lg text-foreground aria-[current=page]:text-accent",
            )}
          </ul>
        </nav>
      </div>
    </>
  );
}
