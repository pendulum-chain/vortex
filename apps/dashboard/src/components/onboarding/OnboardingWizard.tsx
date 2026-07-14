import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { isCorridorAvailableForAccountType, onboardingKindFor, PROVIDER_LABEL, routeFor } from "@/domain/corridors";
import type { Corridor, OnboardingStatus, SenderAccount } from "@/domain/types";
import { ONBOARDING_STATUS_QUERY_KEY } from "@/hooks/useApprovedCorridors";
import { notifyOnboardingStatus } from "@/lib/notify";
import { getOnboardingSteps } from "@/machines/onboardingSteps";
import { useOnboardingOverrideStore } from "@/stores/onboardingOverride.store";
import { AlfredpayKycFlow } from "./alfredpay/AlfredpayKycFlow";
import { AveniaKycFlow } from "./avenia/AveniaKycFlow";
import { ExternalFlow } from "./ExternalFlow";
import { HeadlessFlow } from "./HeadlessFlow";
import { MoneriumKycFlow } from "./monerium/MoneriumKycFlow";

interface OnboardingWizardProps {
  account: SenderAccount;
  corridor: Corridor;
  onClose: () => void;
}

/**
 * Sender onboarding backed by the shared provider machines where the corridor supports the
 * selected legal entity type. Unsupported combinations keep using the generic placeholder.
 */
export function OnboardingWizard({ account, corridor, onClose }: OnboardingWizardProps) {
  const setOverride = useOnboardingOverrideStore(state => state.set);
  const queryClient = useQueryClient();
  const kind = onboardingKindFor(corridor, account.type);
  const route = routeFor(corridor.id, kind);
  const isAvailable = isCorridorAvailableForAccountType(corridor.id, account.type);
  const isRealAlfredpayKyc =
    corridor.provider === "alfredpay" && isAvailable && (route === "headless" || (corridor.id === "US" && kind === "kyb"));
  const isLiveAveniaKyc = corridor.provider === "avenia" && isAvailable && route === "headless";
  const isLiveMoneriumKyc = corridor.provider === "monerium" && route === "headless";
  const steps = getOnboardingSteps(corridor.id, kind);

  /** Mocked flows have no backend to read from, so they fake the corridor's status locally. */
  const onStatusChange = (status: OnboardingStatus) => {
    setOverride(corridor.id, status);
    notifyOnboardingStatus(corridor.name, kind, status);
  };

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
          <AveniaKycFlow business={kind === "kyb"} corridor={corridor} onClose={onClose} onSettled={onSettled} />
        ) : isLiveMoneriumKyc ? (
          <MoneriumKycFlow
            corridor={corridor}
            customerType={account.type === "company" ? "business" : "individual"}
            onClose={onClose}
            onSettled={onSettled}
          />
        ) : route === "headless" ? (
          <HeadlessFlow corridor={corridor} kind={kind} onClose={onClose} onStatusChange={onStatusChange} steps={steps} />
        ) : (
          <ExternalFlow corridor={corridor} kind={kind} onClose={onClose} onStatusChange={onStatusChange} route={route} />
        )}
      </DialogContent>
    </Dialog>
  );
}
