import type { MoneriumRampReadiness, MoneriumWalletLinkResult } from "@vortexfi/kyc";
import type { Onboarding } from "@/domain/types";

/** An approved profile still needs its pay-in wallet linked; a lost OAuth session must be reconnected first. */
export function moneriumWalletLinkRequired(
  onboarding: Pick<Onboarding, "ramp" | "reauthenticationRequired" | "status"> | undefined
): boolean {
  return (
    onboarding?.status === "approved" && onboarding.reauthenticationRequired !== true && onboarding.ramp?.iban !== "provisioned"
  );
}

export function moneriumWalletStep(
  ramp: MoneriumRampReadiness,
  address: string | undefined,
  linked: MoneriumWalletLinkResult | undefined
): "ready" | "move" | "link" {
  const currentWallet = !!address && ramp.linkedAddress?.toLowerCase() === address.toLowerCase();
  if (ramp.iban === "provisioned" && currentWallet) return "ready";
  const linkedHere = currentWallet || (!!address && linked?.address.toLowerCase() === address.toLowerCase());
  return ramp.iban !== "missing" && linkedHere ? "move" : "link";
}
