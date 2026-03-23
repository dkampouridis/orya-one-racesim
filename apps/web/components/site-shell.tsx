import type { ReactNode } from "react";
import Link from "next/link";
import type { Route } from "next";

import { OryaMark } from "@/components/orya-mark";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Overview" },
  { href: "/simulator", label: "Strategy Wall" },
  { href: "/methodology", label: "Model & Method" },
] as const satisfies ReadonlyArray<{ href: Route; label: string }>;

export function SiteShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("relative min-h-screen overflow-hidden bg-background text-foreground", className)}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(224,40,66,0.2),transparent_24%),radial-gradient(circle_at_top_left,rgba(255,182,72,0.06),transparent_20%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent_18%)]" />
      <div className="pointer-events-none absolute inset-0 bg-telemetry-grid bg-[size:78px_78px] opacity-[0.09]" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-none flex-col px-2 pb-8 pt-4 sm:px-3 lg:px-4 xl:px-5 2xl:px-6">
        <header className="sticky top-4 z-40 mb-8 rounded-[14px] border border-white/8 bg-[rgba(8,10,14,0.9)] px-4 py-3 shadow-[0_18px_50px_rgba(0,0,0,0.28)] backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Link href="/" className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-[10px] border border-white/8 bg-white/[0.03] shadow-[0_0_24px_rgba(225,41,68,0.14)]">
                <OryaMark className="h-7 w-7" />
              </div>
              <div>
                <div className="font-display text-sm tracking-[0.24em] text-white">ORYA ONE</div>
                <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">RaceSim | 2026 Formula 1 strategy wall</div>
              </div>
            </Link>
            <nav className="flex items-center gap-2 text-sm">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-[8px] px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground transition hover:bg-white/[0.04] hover:text-white focus-visible:bg-white/[0.06]"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="flex items-center gap-2">
              <div className="hidden items-center gap-2 rounded-[999px] border border-white/8 bg-white/[0.03] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground md:flex">
                <span className="h-2 w-2 rounded-full bg-primary shadow-[0_0_10px_rgba(225,41,68,0.65)]" />
                Race control online
              </div>
              <Badge variant="muted">2026 season MVP</Badge>
            </div>
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
