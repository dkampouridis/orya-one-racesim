import Link from "next/link";
import {
  ArrowRight,
  BrainCircuit,
  CloudSunRain,
  GitBranch,
  LayoutDashboard,
  ShieldCheck,
  Sigma,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const pillars = [
  {
    title: "Qualifying and race pace prior",
    text: "A compact PyTorch model estimates a baseline F1-style pace signal from structured driver, circuit, and condition features.",
    icon: BrainCircuit,
  },
  {
    title: "Tire, fuel, and stint logic",
    text: "Fuel load, tire degradation, qualifying influence, pit loss, and strategy-template tradeoffs stay explicit and inspectable.",
    icon: Sigma,
  },
  {
    title: "Race control and Monte Carlo",
    text: "Weather swings, safety cars, VSCs, DNFs, and late-race incidents are sampled repeatedly to produce outcome distributions instead of single-point picks.",
    icon: CloudSunRain,
  },
];

const releaseSignals = [
  "Formula 1 Grand Prix framing across qualifying, race pace, and pit strategy",
  "Circuit profile, race control tuning, and stint-plan recommendations in one workspace",
  "FastAPI + Next.js monorepo with a modular simulation core",
  "Synthetic public-safe data today, with room for real race data later",
];

export default function HomePage() {
  return (
    <div className="space-y-8 pb-10">
      <section className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <Card className="overflow-hidden border-primary/10 bg-transparent">
          <CardContent className="p-8 sm:p-10 lg:p-12">
            <Badge>Formula 1 Grand Prix simulation</Badge>
            <h1 className="mt-6 max-w-5xl font-display text-[clamp(3rem,7vw,6.4rem)] leading-[0.92] tracking-[-0.05em] text-white">
              Pit-wall simulation for qualifying, race pace, tire degradation, and Grand Prix strategy.
            </h1>
            <p className="mt-6 max-w-3xl text-lg leading-8 text-muted-foreground">
              Orya One RaceSim is built around a Formula 1 race-weekend workflow: choose a Grand Prix, review the circuit, set race conditions, compare stint plans, and run large Monte Carlo projections from a strategy-wall style workspace.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/simulator">
                  Open strategy wall
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="secondary" size="lg">
                <Link href="/methodology">Review race model</Link>
              </Button>
            </div>
            <div className="mt-10 grid gap-3 sm:grid-cols-2">
              {releaseSignals.map((item) => (
                <div key={item} className="rounded-[16px] border border-white/8 bg-black/20 p-4 text-sm leading-6 text-muted-foreground">
                  {item}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.015))]">
          <CardHeader>
            <Badge variant="warning">Strategy wall preview</Badge>
            <CardTitle className="mt-4 text-2xl">A Grand Prix command center</CardTitle>
            <CardDescription>
              The simulator is organized around Grand Prix setup, race control assumptions, stint strategy, driver and team overrides, and race outcome projection.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-[18px] border border-primary/18 bg-slate-950/80 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Example Grand Prix</div>
                  <div className="mt-1 font-display text-2xl text-white">Rainford Harbor Grand Prix</div>
                </div>
                <div className="rounded-[10px] border border-primary/20 bg-primary/10 px-4 py-2 text-xs uppercase tracking-[0.18em] text-primary">
                  1200 runs
                </div>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-[14px] border border-white/8 bg-white/[0.03] p-4">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Pit-wall stance</div>
                  <div className="mt-2 text-lg text-white">Flexible mixed strategy</div>
                  <div className="mt-2 text-sm text-muted-foreground">Adaptive undercut and safety-car aware plans gain value as disruption rises.</div>
                </div>
                <div className="rounded-[14px] border border-white/8 bg-white/[0.03] p-4">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Race engineer view</div>
                  <div className="mt-2 text-lg text-white">Podium and finish outlook</div>
                  <div className="mt-2 text-sm text-muted-foreground">
                    The app focuses on finish distributions, strategy tradeoffs, and readable race-control risk.
                  </div>
                </div>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                {[
                  { label: "Qualifying model", value: "Pace baseline" },
                  { label: "Stint logic", value: "Tire / fuel / pit" },
                  { label: "Race control", value: "Safety car / VSC / weather" },
                ].map((item) => (
                  <div key={item.label} className="rounded-[14px] border border-white/8 bg-black/20 p-4">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{item.label}</div>
                    <div className="mt-2 text-white">{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        {pillars.map((pillar) => (
          <Card key={pillar.title}>
            <CardHeader>
              <pillar.icon className="h-5 w-5 text-primary" />
              <CardTitle className="mt-4">{pillar.title}</CardTitle>
              <CardDescription>{pillar.text}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <LayoutDashboard className="h-5 w-5 text-primary" />
              <CardTitle>Built like race operations software</CardTitle>
            </div>
            <CardDescription>
              Dense when needed, quiet when not. The UI is meant to feel closer to a pit-wall strategy screen than a generic SaaS dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-7 text-muted-foreground">
            <p>
              Grand Prix setup, stint strategy comparison, and race outcome interpretation sit in one workspace. You can adjust circuit conditions, inspect recommendations, and read race-control summaries without leaving the main flow.
            </p>
            <p>
              The project works immediately with synthetic data, while the code structure leaves room for future calibration, qualifying simulation, and more detailed race logic.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <CardTitle>Structured for race-model iteration</CardTitle>
            </div>
            <CardDescription>
              Built so the model, UI, and data layer can all be pushed further without a rewrite.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {[
              "Hybrid modeling with explicit qualifying, tire, and race-event assumptions",
              "FastAPI backend and typed Next.js frontend",
              "Method docs for the race model, event engine, and roadmap",
              "Sample circuit, driver, team, and strategy datasets",
            ].map((item) => (
              <div key={item} className="rounded-[16px] border border-white/8 bg-black/20 p-4 text-sm leading-6 text-muted-foreground">
                {item}
              </div>
            ))}
            <div className="rounded-[16px] border border-primary/15 bg-primary/8 p-5 sm:col-span-2">
              <div className="flex items-center gap-3">
                <GitBranch className="h-4 w-4 text-primary" />
                <div className="text-[11px] uppercase tracking-[0.18em] text-primary">Engineering posture</div>
              </div>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                Clear setup, realistic limits, and modular code boundaries are treated as part of the product, not cleanup work for later.
              </p>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
