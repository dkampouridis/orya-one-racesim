import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const sections = [
  {
    title: "1. Qualifying and race pace prior",
    text: "A compact PyTorch MLP predicts a baseline pace prior from tabular driver, circuit, and condition features. It does not forecast the finishing order directly; it supplies the starting pace signal for the wider Grand Prix simulation.",
  },
  {
    title: "2. Tire, fuel, and stint logic",
    text: "Explicit rule-based layers model fuel sensitivity, tire degradation, pit-loss exposure, qualifying leverage, and strategy-template tradeoffs. These factors stay visible on purpose so the simulator remains inspectable.",
  },
  {
    title: "3. Race control and environment engine",
    text: "Weather swings, yellow flags, VSCs, safety cars, red flags, local incidents, and DNFs are generated probabilistically. The objective is believable abstraction, not false precision.",
  },
  {
    title: "4. Monte Carlo race projection",
    text: "The engine runs many independent race realizations and aggregates finish distributions, win and podium rates, DNF probabilities, race-control frequencies, and driver-level confidence signals.",
  },
];

export default function MethodologyPage() {
  return (
    <div className="space-y-6 pb-10">
      <div className="max-w-4xl">
        <Badge>Model and race simulation method</Badge>
        <h1 className="mt-4 font-display text-[clamp(2.5rem,5vw,4.2rem)] leading-[0.96] tracking-[-0.04em] text-white">
          How the Grand Prix model handles pace, strategy, tire wear, and race control.
        </h1>
        <p className="mt-4 text-base leading-7 text-muted-foreground">
          Orya One RaceSim is built around a simple rule: learn what should be learned, simulate what should stay explicit, and document what is still simplified.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {sections.map((section) => (
          <Card key={section.title}>
            <CardHeader>
              <CardTitle>{section.title}</CardTitle>
              <CardDescription>{section.text}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Card>
          <CardHeader>
            <CardTitle>What the current MVP does well</CardTitle>
            <CardDescription>
              The current MVP puts more emphasis on race-weekend coherence and explainability than on maximum mechanical detail.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {[
              "Produces scenario-specific strategy recommendations with explicit risk and tradeoff framing",
              "Separates pace estimation from race-resolution logic so qualifying and race assumptions stay understandable",
              "Summarizes race-control impact instead of hiding disruptions inside a final ranking",
              "Keeps the code modular enough for future weather, qualifying, and strategy upgrades",
            ].map((item) => (
              <div key={item} className="rounded-[16px] border border-white/8 bg-black/20 p-4 text-sm leading-7 text-muted-foreground">
                {item}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>What is intentionally simplified</CardTitle>
            <CardDescription>
              This is an MVP, not a claim of lap-perfect Formula 1 physics.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {[
              "Race resolution is stint-aware and event-aware rather than full lap-by-lap simulation",
              "Qualifying influence is modeled as a performance component, not as a standalone session engine",
              "Safety-car behavior is abstracted into pit-value and compression effects rather than full bunching mechanics",
              "Sample data is synthetic and intended to be replaced by future public or proprietary ingestion pipelines",
            ].map((item) => (
              <div key={item} className="rounded-[16px] border border-white/8 bg-black/20 p-4 text-sm leading-7 text-muted-foreground">
                {item}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Future realism path</CardTitle>
          <CardDescription>
            The current architecture is set up so the next layer of realism can be added without rebuilding the product.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            "Qualifying simulation and grid generation",
            "Richer lap-window weather transitions and crossover modeling",
            "Pit-stop optimization and undercut / overcut search",
            "Calibration workflows against real historical race data",
          ].map((item) => (
            <div key={item} className="rounded-[16px] border border-white/8 bg-black/20 p-4 text-sm leading-7 text-muted-foreground">
              {item}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
