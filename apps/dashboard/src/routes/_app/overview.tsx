import { createFileRoute } from "@tanstack/react-router";
import { CircleCheck, Clock, Globe, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { AddCorridorDropdown } from "@/components/onboarding/AddCorridorDropdown";
import { CorridorCard } from "@/components/onboarding/CorridorCard";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import { Card, CardContent } from "@/components/ui/card";
import { CORRIDORS, isLive } from "@/domain/corridors";
import type { CorridorId } from "@/domain/types";
import { useActiveAccount } from "@/hooks/useActiveAccount";

export const Route = createFileRoute("/_app/overview")({
  component: OverviewPage
});

function OverviewPage() {
  const account = useActiveAccount();
  const [activeCorridor, setActiveCorridor] = useState<CorridorId | null>(null);

  if (!account) {
    return null;
  }

  const corridors = account.selectedCorridors.map(id => CORRIDORS[id]);
  const liveCorridors = corridors.filter(corridor => corridor.availability === "live");
  const approved = liveCorridors.filter(c => account.onboardings[c.id]?.status === "approved").length;
  const inProgress = liveCorridors.filter(c => {
    const status = account.onboardings[c.id]?.status;
    return status === "pending" || status === "in_review";
  }).length;
  const comingSoon = corridors.length - liveCorridors.length;

  const stats = [
    { icon: Globe, label: "Corridors", tone: "text-primary", value: corridors.length },
    { icon: CircleCheck, label: "Approved", tone: "text-success", value: approved },
    { icon: ShieldCheck, label: "In progress", tone: "text-info", value: inProgress },
    ...(comingSoon > 0 ? [{ icon: Clock, label: "Coming soon", tone: "text-muted-foreground", value: comingSoon }] : [])
  ];

  return (
    <div className="mx-auto grid max-w-5xl gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">Onboarding</h1>
          <p className="text-muted-foreground">
            Complete KYB/KYC for {account.name} to unlock cross-border transfers in each corridor.
          </p>
        </div>
        <AddCorridorDropdown account={account} />
      </div>

      <div className={stats.length === 4 ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-4" : "grid gap-4 sm:grid-cols-3"}>
        {stats.map(stat => (
          <SummaryCard icon={stat.icon} key={stat.label} label={stat.label} tone={stat.tone} value={`${stat.value}`} />
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {corridors.map(corridor => (
          <CorridorCard
            account={account}
            corridor={corridor}
            key={corridor.id}
            onStart={() => setActiveCorridor(corridor.id)}
          />
        ))}
      </div>

      {activeCorridor && isLive(activeCorridor) && (
        <OnboardingWizard
          account={account}
          corridor={CORRIDORS[activeCorridor]}
          key={`${account.id}-${activeCorridor}`}
          onClose={() => setActiveCorridor(null)}
        />
      )}
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  tone
}: {
  icon: typeof ShieldCheck;
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3">
        <span className={`flex size-10 items-center justify-center rounded-lg bg-muted ${tone}`}>
          <Icon className="size-5" />
        </span>
        <div>
          <p className="font-semibold text-2xl leading-none">{value}</p>
          <p className="text-muted-foreground text-sm">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
