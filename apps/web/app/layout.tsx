import type { ReactNode } from "react";
import type { Metadata } from "next";

import { SiteShell } from "@/components/site-shell";

import "./globals.css";

export const metadata: Metadata = {
  title: "Orya One RaceSim",
  description: "Formula 1 Grand Prix simulation for qualifying influence, race pace, tire wear, and pit-wall strategy analysis.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body>
        <SiteShell>{children}</SiteShell>
      </body>
    </html>
  );
}
