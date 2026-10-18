import type { ReactNode } from "react";
import Link from "next/link";

import { ReliefBand } from "@/components/ui/relief-band";
import { siteConfig } from "@/site.config";

import { MainNav } from "./main-nav";
import { ThemeSelect } from "./theme-select";

export function SiteHeader({ search }: { search?: ReactNode }) {
  return (
    <header className="relative">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="font-serif text-xl font-bold tracking-tight text-foreground"
        >
          {siteConfig.name}
        </Link>
        <div className="flex items-center gap-3 md:gap-6">
          <MainNav />
          <div className="flex items-center gap-2">
            {search}
            <ThemeSelect />
          </div>
        </div>
      </div>
      <ReliefBand />
    </header>
  );
}
