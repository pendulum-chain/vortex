import { createFileRoute } from "@tanstack/react-router";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { CorridorCard } from "@/components/onboarding/CorridorCard";
import { CORRIDORS } from "@/domain/corridors";
import { useActiveAccount } from "@/hooks/useActiveAccount";
import { spring } from "@/lib/motion";
import { onboardingUrl } from "@/lib/widget";

export const Route = createFileRoute("/_app/overview")({
  component: OverviewPage
});

function OverviewPage() {
  const account = useActiveAccount();

  if (!account) {
    return null;
  }

  const corridors = account.selectedCorridors.map(id => CORRIDORS[id]);
  const approved = corridors.filter(corridor => account.onboardings[corridor.id]?.status === "approved").length;

  return (
    <Stagger className="mx-auto grid max-w-5xl gap-6">
      <StaggerItem>
        <h1 className="text-balance font-semibold text-2xl tracking-tight">Onboarding</h1>
        <p className="text-muted-foreground">
          Complete KYB/KYC for {account.name} to unlock transfers — {approved} of {corridors.length} corridor
          {corridors.length === 1 ? "" : "s"} approved.
        </p>
      </StaggerItem>

      <Stagger className="grid gap-4 md:grid-cols-2">
        {corridors.map(corridor => (
          <StaggerItem
            className="h-full"
            key={corridor.id}
            transition={spring}
            whileHover={{ y: -4 }}
            whileTap={{ scale: 0.99 }}
          >
            <CorridorCard
              account={account}
              corridor={corridor}
              onStart={() => {
                window.location.href = onboardingUrl(corridor.id);
              }}
            />
          </StaggerItem>
        ))}
      </Stagger>
    </Stagger>
  );
}
