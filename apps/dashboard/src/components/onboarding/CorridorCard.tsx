import { ArrowRight, ExternalLink, FileText, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { onboardingKindFor, PROVIDER_LABEL, routeFor } from "@/domain/corridors";
import { STATUS_META } from "@/domain/status";
import type { Corridor, OnboardingRoute, OnboardingStatus, SenderAccount } from "@/domain/types";
import { StatusBadge } from "./StatusBadge";

interface CorridorCardProps {
  account: SenderAccount;
  corridor: Corridor;
  onStart: () => void;
}

const ROUTE_HINT: Record<OnboardingRoute, { icon: typeof FileText; label: string } | null> = {
  google_form: { icon: FileText, label: "Completed via external Google Form" },
  headless: null,
  redirect: { icon: ExternalLink, label: "Completed via partner redirect" }
};

/** Progress bar colour carries the outcome: green when approved, red when rejected, brand blue mid-flow. */
const BAR_TONE: Record<OnboardingStatus, string> = {
  approved: "bg-success",
  in_review: "bg-primary",
  not_started: "bg-primary",
  pending: "bg-primary",
  rejected: "bg-destructive",
  started: "bg-primary"
};

export function CorridorCard({ account, corridor, onStart }: CorridorCardProps) {
  const kind = onboardingKindFor(corridor, account.type);
  const onboarding = account.onboardings[corridor.id];
  const meta = onboarding ? STATUS_META[onboarding.status] : null;
  const hint = ROUTE_HINT[routeFor(corridor.id, kind)];

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
          <p className="text-destructive text-xs">Verification was rejected — retry below or contact support.</p>
        ) : hint ? (
          <p className="flex items-center gap-1.5 text-muted-foreground text-xs">
            <hint.icon className="size-3.5" />
            {hint.label}
          </p>
        ) : (
          <p className="text-muted-foreground text-xs">
            {onboarding
              ? `Updated ${new Date(onboarding.updatedAt).toLocaleDateString(undefined, {
                  day: "numeric",
                  month: "short",
                  year: "numeric"
                })}`
              : ""}
          </p>
        )}
      </CardContent>

      <CardFooter>
        {onboarding ? (
          <CorridorAction
            kind={kind}
            onStart={onStart}
            reauthenticationRequired={onboarding.reauthenticationRequired === true}
            status={onboarding.status}
          />
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

function CorridorAction({
  status,
  kind,
  onStart,
  reauthenticationRequired
}: {
  status: OnboardingStatus;
  kind: "kyb" | "kyc";
  onStart: () => void;
  reauthenticationRequired: boolean;
}) {
  if (status === "not_started") {
    return (
      <Button className="w-full" onClick={onStart}>
        Start {kind.toUpperCase()}
        <ArrowRight />
      </Button>
    );
  }
  if (status === "pending" || status === "started") {
    return (
      <Button className="w-full" disabled variant="outline">
        {status === "started" ? "Verification started" : "Verification pending"}
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
    if (reauthenticationRequired) {
      return (
        <Button className="w-full" onClick={onStart} variant="outline">
          Re-authenticate with Monerium
        </Button>
      );
    }
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
