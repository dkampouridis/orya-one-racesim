import type { ReactNode } from "react";
import Link from "next/link";
import type { Route } from "next";

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
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(224,40,66,0.18),transparent_26%),radial-gradient(circle_at_top_left,rgba(255,182,72,0.08),transparent_22%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.03),transparent_24%)]" />
      <div className="pointer-events-none absolute inset-0 bg-telemetry-grid bg-[size:84px_84px] opacity-[0.08]" />
      <div className="relative mx-auto flex min-h-screen max-w-[1600px] flex-col px-4 pb-8 pt-4 sm:px-6 lg:px-8">
        <header className="sticky top-4 z-40 mb-8 rounded-[18px] border border-white/8 bg-[rgba(9,11,15,0.82)] px-4 py-3 backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Link href="/" className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-[12px] border border-primary/25 bg-primary/10 font-display text-sm tracking-[0.28em] text-primary">
                OO
              </div>
              <div>
                <div className="font-display text-sm tracking-[0.24em] text-white">ORYA ONE</div>
                <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">RaceSim | Grand Prix Strategy</div>
              </div>
            </Link>
            <nav className="flex items-center gap-2 text-sm">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-[10px] px-4 py-2 text-muted-foreground transition hover:bg-white/[0.04] hover:text-white"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <Badge variant="muted">F1-style MVP</Badge>
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
