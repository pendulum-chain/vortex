import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { onboardingKindFor, PROVIDER_LABEL, routeFor } from "@/domain/corridors";
import type { Corridor, OnboardingStatus, SenderAccount } from "@/domain/types";
import { notifyOnboardingStatus } from "@/lib/notify";
import { getOnboardingSteps } from "@/machines/onboardingSteps";
import { useDashboardStore } from "@/stores/dashboard.store";
import { ExternalFlow } from "./ExternalFlow";
import { HeadlessFlow } from "./HeadlessFlow";

interface OnboardingWizardProps {
  account: SenderAccount;
  corridor: Corridor;
  onClose: () => void;
}

export function OnboardingWizard({ account, corridor, onClose }: OnboardingWizardProps) {
  const setOnboardingStatus = useDashboardStore(state => state.setOnboardingStatus);
  const ensureSelfRecipient = useDashboardStore(state => state.ensureSelfRecipient);
  const kind = onboardingKindFor(corridor, account.type);
  const route = routeFor(corridor.id, kind);

  const onStatusChange = (status: OnboardingStatus) => {
    setOnboardingStatus(account.id, corridor.id, status);
    notifyOnboardingStatus(corridor.name, kind, status);
    // Once a corridor is approved, add the account holder as a recipient so they can send to themselves.
    if (status === "approved") {
      ensureSelfRecipient(account.id, corridor.id, account.name);
    }
  };

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

        {route === "headless" ? (
          <HeadlessFlow
            corridor={corridor}
            kind={kind}
            onClose={onClose}
            onStatusChange={onStatusChange}
            steps={getOnboardingSteps(corridor.id, kind)}
          />
        ) : (
          <ExternalFlow corridor={corridor} kind={kind} onClose={onClose} onStatusChange={onStatusChange} route={route} />
        )}
      </DialogContent>
    </Dialog>
  );
}
