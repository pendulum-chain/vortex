import { ArrowRight, ExternalLink, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { onboardingKindFor, PROVIDER_LABEL } from "@/domain/corridors";
import { STATUS_META } from "@/domain/status";
import type { Corridor, OnboardingStatus, SenderAccount } from "@/domain/types";
import { StatusBadge } from "./StatusBadge";

interface CorridorCardProps {
  account: SenderAccount;
  corridor: Corridor;
  onStart: () => void;
}

/** Progress bar colour carries the outcome: green when approved, red when rejected, brand blue mid-flow. */
const BAR_TONE: Record<OnboardingStatus, string> = {
  approved: "bg-success",
  in_review: "bg-primary",
  not_started: "bg-primary",
  pending: "bg-primary",
  rejected: "bg-destructive"
};

export function CorridorCard({ account, corridor, onStart }: CorridorCardProps) {
  const kind = onboardingKindFor(corridor, account.type);
  const onboarding = account.onboardings[corridor.id];
  const meta = onboarding ? STATUS_META[onboarding.status] : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-muted text-2xl">{corridor.flag}</span>
            <div>
              <p className="font-semibold">{corridor.name}</p>
              <p className="text-muted-foreground text-sm">
                {kind.toUpperCase()} · {PROVIDER_LABEL[corridor.provider]} · {corridor.currency}
              </p>
            </div>
          </div>
          {onboarding && <StatusBadge status={onboarding.status} />}
        </div>
      </CardHeader>

      <CardContent className="grid gap-2">
        <Progress indicatorClassName={BAR_TONE[onboarding?.status ?? "not_started"]} value={meta?.progress ?? 0} />
        {onboarding?.status === "rejected" ? (
          <p className="text-destructive text-xs">Verification was rejected — retry in the widget or contact support.</p>
        ) : (
          <p className="flex items-center gap-1.5 text-muted-foreground text-xs">
            <ExternalLink className="size-3.5" />
            {onboarding?.status === "approved"
              ? "Approved"
              : onboarding
                ? "Onboarding in progress"
                : "Onboard via the Vortex widget"}
          </p>
        )}
      </CardContent>

      <CardFooter>
        {onboarding ? (
          <CorridorAction kind={kind} onStart={onStart} status={onboarding.status} />
        ) : (
          <Button className="w-full" onClick={onStart}>
            Start {kind.toUpperCase()}
            <ArrowRight />
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

function CorridorAction({ status, kind, onStart }: { status: OnboardingStatus; kind: "kyb" | "kyc"; onStart: () => void }) {
  if (status === "not_started") {
    return (
      <Button className="w-full" onClick={onStart}>
        Start {kind.toUpperCase()}
        <ArrowRight />
      </Button>
    );
  }
  if (status === "pending") {
    return (
      <Button className="w-full" onClick={onStart} variant="outline">
        Continue {kind.toUpperCase()}
        <ArrowRight />
      </Button>
    );
  }
  if (status === "rejected") {
    return (
      <Button className="w-full" onClick={onStart} variant="outline">
        <RotateCcw />
        Retry {kind.toUpperCase()}
      </Button>
    );
  }
  if (status === "in_review") {
    return (
      <Button className="w-full" disabled variant="outline">
        Awaiting provider review
      </Button>
    );
  }
  return (
    <Button className="w-full text-success hover:text-success" disabled variant="ghost">
      Verification complete
    </Button>
  );
}
