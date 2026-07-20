import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { isCorridorAvailableForAccountType, onboardingKindFor, PROVIDER_LABEL, routeFor } from "@/domain/corridors";
import type { Corridor, OnboardingKind, OnboardingStatus, SenderAccount } from "@/domain/types";
import { ONBOARDING_STATUS_QUERY_KEY } from "@/hooks/useApprovedCorridors";
import { notifyOnboardingStatus } from "@/lib/notify";
import { AlfredpayKycFlow } from "./alfredpay/AlfredpayKycFlow";
import { AveniaKycFlow } from "./avenia/AveniaKycFlow";
import { MoneriumKycFlow } from "./monerium/MoneriumKycFlow";

interface OnboardingWizardProps {
  account: SenderAccount;
  corridor: Corridor;
  onClose: () => void;
}

/**
 * Sender onboarding backed by the shared provider machines where the corridor supports the
 * selected legal entity type: Alfredpay KYC/KYB (MX/CO, US companies), Avenia KYC/KYB (BR),
 * Monerium OAuth for EU. Combinations without a real provider flow (US individuals, AR
 * companies) are unavailable — never simulated.
 */
export function OnboardingWizard({ account, corridor, onClose }: OnboardingWizardProps) {
  const queryClient = useQueryClient();
  const kind = onboardingKindFor(corridor, account.type);
  const route = routeFor(corridor.id, kind);
  const isAvailable = isCorridorAvailableForAccountType(corridor.id, account.type);
  const isRealAlfredpayKyc =
    corridor.provider === "alfredpay" && isAvailable && (route === "headless" || (corridor.id === "US" && kind === "kyb"));
  const isLiveAveniaKyc = corridor.provider === "avenia" && isAvailable && route === "headless";
  const isLiveMoneriumKyc = corridor.provider === "monerium" && route === "headless";

  // A pending company flow whose Avenia subaccount already exists (CNPJ and company name supplied):
  // resume straight at the verification links instead of re-asking the form.
  const onboarding = account.onboardings[corridor.id];
  const aveniaResume =
    kind === "kyb" && onboarding?.status === "pending" && onboarding.taxReference
      ? { companyName: onboarding.companyName ?? null, taxId: onboarding.taxReference }
      : undefined;

  /** The real flow already moved the provider's status — refetch it rather than override it. */
  const onSettled = useCallback(
    (status: OnboardingStatus) => {
      notifyOnboardingStatus(corridor.name, kind, status);
      queryClient.invalidateQueries({ queryKey: ONBOARDING_STATUS_QUERY_KEY });
    },
    [corridor.name, kind, queryClient]
  );

  return (
    <Dialog onOpenChange={isOpen => !isOpen && onClose()} open>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-xl">{corridor.flag}</span>
            {corridor.name} {kind.toUpperCase()}
          </DialogTitle>
          <DialogDescription>
            {account.name} · {PROVIDER_LABEL[corridor.provider]}
          </DialogDescription>
        </DialogHeader>

        {isRealAlfredpayKyc ? (
          <AlfredpayKycFlow
            business={kind === "kyb"}
            corridor={corridor}
            onClose={onClose}
            onSettled={onSettled}
            userEmail={account.identifier}
          />
        ) : isLiveAveniaKyc ? (
          <AveniaKycFlow
            business={kind === "kyb"}
            corridor={corridor}
            onClose={onClose}
            onSettled={onSettled}
            resume={aveniaResume}
          />
        ) : isLiveMoneriumKyc ? (
          <MoneriumKycFlow
            corridor={corridor}
            customerType={account.type === "company" ? "business" : "individual"}
            onClose={onClose}
            onSettled={onSettled}
          />
        ) : (
          <UnavailableNotice corridor={corridor} kind={kind} onClose={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Reached only via deep links — the corridor card already disables entry for these combinations. */
function UnavailableNotice({ corridor, kind, onClose }: { corridor: Corridor; kind: OnboardingKind; onClose: () => void }) {
  return (
    <>
      <div className="flex min-h-[120px] items-center justify-center py-6 text-center">
        <p className="max-w-sm text-muted-foreground text-sm">
          {corridor.name} {kind.toUpperCase()} verification is not available yet. Please contact support if you need this
          corridor.
        </p>
      </div>
      <DialogFooter>
        <Button onClick={onClose} variant="outline">
          Close
        </Button>
      </DialogFooter>
    </>
  );
}
