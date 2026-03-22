import { SimulatorWorkspace } from "@/components/simulator-workspace";
import { Badge } from "@/components/ui/badge";

export default function SimulatorPage() {
  return (
    <div className="space-y-6 pb-10">
      <div className="max-w-3xl">
        <Badge>Grand Prix strategy workspace</Badge>
        <h1 className="mt-4 font-display text-[clamp(2.4rem,5vw,4rem)] leading-[0.98] tracking-[-0.04em] text-white">
          Build a Grand Prix, shape the race weekend, and project the finish.
        </h1>
        <p className="mt-4 text-base leading-7 text-muted-foreground">
          Set circuit assumptions, qualifying influence, tire degradation, safety-car risk, and stint strategy from a single pit-wall style workspace.
        </p>
      </div>
      <SimulatorWorkspace />
    </div>
  );
}
