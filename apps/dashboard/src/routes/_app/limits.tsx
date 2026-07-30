import { createFileRoute } from "@tanstack/react-router";
import { LimitsCard } from "@/components/limits/LimitsCard";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";

export const Route = createFileRoute("/_app/limits")({
  component: LimitsPage
});

function LimitsPage() {
  return (
    <Stagger className="mx-auto grid max-w-6xl gap-6">
      <StaggerItem>
        <h1 className="text-balance font-semibold text-2xl tracking-tight">Limits</h1>
        <p className="text-muted-foreground">Review your monthly limits across approved corridors.</p>
      </StaggerItem>
      <StaggerItem>
        <LimitsCard />
      </StaggerItem>
    </Stagger>
  );
}
