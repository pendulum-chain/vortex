import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { onboardingKindFor, PROVIDER_LABEL, routeFor } from "@/domain/corridors";
import type { Corridor, OnboardingStatus, SenderAccount } from "@/domain/types";
import { ONBOARDING_STATUS_QUERY_KEY } from "@/hooks/useApprovedCorridors";
import { notifyOnboardingStatus } from "@/lib/notify";
import { getOnboardingSteps } from "@/machines/onboardingSteps";
import { useOnboardingOverrideStore } from "@/stores/onboardingOverride.store";
import { AlfredpayKycFlow } from "./alfredpay/AlfredpayKycFlow";
import { AveniaKycFlow } from "./avenia/AveniaKycFlow";
import { ExternalFlow } from "./ExternalFlow";
import { HeadlessFlow } from "./HeadlessFlow";

interface OnboardingWizardProps {
  account: SenderAccount;
  corridor: Corridor;
  onClose: () => void;
}

/**
 * Sender onboarding. Individual KYC on Alfredpay corridors (MX/CO/AR) runs the real provider
 * machine and submits real data. BRL individual KYC runs the shared live Avenia machine.
 * Everything else still uses the generic mocked wizard.
 */
export function OnboardingWizard({ account, corridor, onClose }: OnboardingWizardProps) {
  const setOverride = useOnboardingOverrideStore(state => state.set);
  const queryClient = useQueryClient();
  const kind = onboardingKindFor(corridor, account.type);
  const route = routeFor(corridor.id, kind);
  const isRealAlfredpayKyc = corridor.provider === "alfredpay" && kind === "kyc" && route === "headless";
  const isLiveAveniaKyc = corridor.provider === "avenia" && kind === "kyc" && route === "headless";
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
          <AlfredpayKycFlow corridor={corridor} onClose={onClose} onSettled={onSettled} />
        ) : isLiveAveniaKyc ? (
          <AveniaKycFlow corridor={corridor} onClose={onClose} onSettled={onSettled} />
        ) : route === "headless" ? (
          <HeadlessFlow corridor={corridor} kind={kind} onClose={onClose} onStatusChange={onStatusChange} steps={steps} />
        ) : (
          <ExternalFlow corridor={corridor} kind={kind} onClose={onClose} onStatusChange={onStatusChange} route={route} />
        )}
      </DialogContent>
    </Dialog>
  );
}
