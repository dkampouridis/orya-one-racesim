import type { ReactNode } from "react";
import Link from "next/link";
import type { Route } from "next";

import { OryaMark } from "@/components/orya-mark";
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
    <div
      className={cn("relative min-h-screen bg-[#080808] text-[#f0f0f0]", className)}
    >
      <div className="relative mx-auto flex min-h-screen w-full max-w-none flex-col px-2 pb-8 pt-0 sm:px-3 lg:px-4 xl:px-5 2xl:px-6">
        {/* ── Header ─────────────────────────────────────── */}
        <header
          style={{ height: "48px", borderBottom: "1px solid #1f1f1f", background: "#080808" }}
          className="sticky top-0 z-40 flex items-center px-4"
        >
          <div className="flex w-full items-center justify-between gap-6">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-3 shrink-0">
              <div
                style={{
                  width: 32,
                  height: 32,
                  border: "1px solid #1f1f1f",
                  borderRadius: "2px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "#0f0f0f",
                }}
              >
                <OryaMark className="h-5 w-5" />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    fontFamily: "'DM Mono', monospace",
                    fontSize: 13,
                    fontWeight: 500,
                    letterSpacing: "0.18em",
                    color: "#e8002d",
                    textTransform: "uppercase",
                  }}
                >
                  ORYA ONE
                </span>
                <span
                  style={{
                    width: 1,
                    height: 14,
                    background: "#2a2a2a",
                    display: "inline-block",
                  }}
                />
                <span
                  style={{
                    fontFamily: "'DM Mono', monospace",
                    fontSize: 11,
                    fontWeight: 400,
                    letterSpacing: "0.16em",
                    color: "#444444",
                    textTransform: "uppercase",
                  }}
                >
                  RACESIM
                </span>
              </div>
            </Link>

            {/* Nav */}
            <nav className="hidden items-center gap-0 md:flex">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 11,
                    fontWeight: 500,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "#8a8a8a",
                    padding: "0 16px",
                    height: 48,
                    display: "flex",
                    alignItems: "center",
                    borderBottom: "2px solid transparent",
                    transition: "color 100ms, border-color 100ms",
                  }}
                  className="hover:text-[#f0f0f0] hover:border-b-[#e8002d]"
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            {/* Right — status */}
            <div className="flex items-center gap-2 shrink-0">
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  border: "1px solid #1f1f1f",
                  borderRadius: "2px",
                  padding: "3px 8px",
                  background: "#0f0f0f",
                }}
              >
                <span
                  className="animate-pulse-dot"
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "#e8002d",
                    display: "inline-block",
                    boxShadow: "0 0 6px rgba(232,0,45,0.7)",
                  }}
                />
                <span
                  style={{
                    fontFamily: "'DM Mono', monospace",
                    fontSize: 9,
                    fontWeight: 500,
                    letterSpacing: "0.22em",
                    color: "#8a8a8a",
                    textTransform: "uppercase",
                    whiteSpace: "nowrap",
                  }}
                >
                  RACE CONTROL ONLINE
                </span>
              </div>
              <div
                style={{
                  border: "1px solid #2a2a2a",
                  borderRadius: "2px",
                  padding: "3px 8px",
                  background: "transparent",
                }}
              >
                <span
                  style={{
                    fontFamily: "'DM Mono', monospace",
                    fontSize: 9,
                    fontWeight: 500,
                    letterSpacing: "0.18em",
                    color: "#8a8a8a",
                    textTransform: "uppercase",
                  }}
                >
                  2026 SEASON MVP
                </span>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 pt-3">{children}</main>
      </div>
    </div>
  );
}
