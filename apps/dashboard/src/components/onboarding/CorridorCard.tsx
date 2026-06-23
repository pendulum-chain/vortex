import { ArrowRight, Clock, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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

export function CorridorCard({ account, corridor, onStart }: CorridorCardProps) {
  const kind = onboardingKindFor(corridor, account.type);
  const onboarding = account.onboardings[corridor.id];
  const isComingSoon = corridor.availability === "coming_soon";
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
          {isComingSoon || !onboarding ? (
            <Badge variant="secondary">
              <Clock />
              Coming soon
            </Badge>
          ) : (
            <StatusBadge status={onboarding.status} />
          )}
        </div>
      </CardHeader>

      <CardContent className="grid gap-2">
        <Progress value={meta?.progress ?? 0} />
        <p className="text-muted-foreground text-xs">
          {isComingSoon || !onboarding
            ? `${PROVIDER_LABEL[corridor.provider]} support is launching soon`
            : `Updated ${new Date(onboarding.updatedAt).toLocaleDateString(undefined, {
                day: "numeric",
                month: "short",
                year: "numeric"
              })}`}
        </p>
      </CardContent>

      <CardFooter>
        {isComingSoon || !onboarding ? (
          <Button className="w-full" disabled variant="outline">
            Available soon
          </Button>
        ) : (
          <CorridorAction kind={kind} onStart={onStart} status={onboarding.status} />
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
