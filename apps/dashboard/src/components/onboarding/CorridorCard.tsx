import { ArrowRight, ExternalLink, FileText, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { isOnboardingAvailable, onboardingKindFor, PROVIDER_LABEL, routeFor } from "@/domain/corridors";
import type { AlfredpayCorridorId } from "@/domain/fiatAccounts";
import { STATUS_META } from "@/domain/status";
import type { Corridor, OnboardingRoute, OnboardingStatus, SenderAccount } from "@/domain/types";
import { useFiatAccounts } from "@/hooks/useFiatAccounts";
import { PayoutAccountsSection } from "./PayoutAccountsSection";
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
  const available = isOnboardingAvailable(corridor, kind);
  const onboarding = account.onboardings[corridor.id];
  const meta = onboarding ? STATUS_META[onboarding.status] : null;
  const hint = ROUTE_HINT[routeFor(corridor.id, kind)];
  const managesPayoutAccounts = corridor.provider === "alfredpay" && onboarding?.status === "approved";
  const fiatAccounts = useFiatAccounts(corridor.id, managesPayoutAccounts);
  const payoutAccountMissing = managesPayoutAccounts && fiatAccounts.data?.length === 0;

  return (
    <Card data-testid={`corridor-card-${corridor.id}`}>
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
        <Progress
          aria-label={`${corridor.name} onboarding progress`}
          indicatorClassName={payoutAccountMissing ? "bg-primary" : BAR_TONE[onboarding?.status ?? "not_started"]}
          value={payoutAccountMissing ? 90 : (meta?.progress ?? 0)}
        />
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
        {managesPayoutAccounts ? (
          <PayoutAccountsSection
            accounts={fiatAccounts.data}
            corridorId={corridor.id as AlfredpayCorridorId}
            error={fiatAccounts.error}
            isLoading={fiatAccounts.isLoading}
            refetch={() => {
              fiatAccounts.refetch();
            }}
          />
        ) : !available && (!onboarding || onboarding.status === "not_started" || onboarding.status === "rejected") ? (
          <Button className="w-full" disabled variant="outline">
            {kind.toUpperCase()} not yet available
          </Button>
        ) : onboarding ? (
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
    // The provider account exists but the user hasn't submitted their details yet — this is a
    // resumable, pre-submission state (e.g. the customer was created then the wizard was closed).
    // Keep the action enabled: reopening re-checks the canonical backend status and drops the user
    // back onto the right step, so they're never locked out after a refresh or modal close.
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
