import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { onboardingKindFor, PROVIDER_LABEL, routeFor } from "@/domain/corridors";
import type { Corridor, OnboardingStatus, SenderAccount } from "@/domain/types";
import { notifyOnboardingStatus } from "@/lib/notify";
import { getOnboardingSteps } from "@/machines/onboardingSteps";
import { useOnboardingOverrideStore } from "@/stores/onboardingOverride.store";
import { ExternalFlow } from "./ExternalFlow";
import { HeadlessFlow } from "./HeadlessFlow";

interface OnboardingWizardProps {
  account: SenderAccount;
  corridor: Corridor;
  onClose: () => void;
}

export function OnboardingWizard({ account, corridor, onClose }: OnboardingWizardProps) {
  const setOverride = useOnboardingOverrideStore(state => state.set);
  const kind = onboardingKindFor(corridor, account.type);
  const route = routeFor(corridor.id, kind);

  const onStatusChange = (status: OnboardingStatus) => {
    setOverride(corridor.id, status);
    notifyOnboardingStatus(corridor.name, kind, status);
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
