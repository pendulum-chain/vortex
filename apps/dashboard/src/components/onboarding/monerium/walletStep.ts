import type { MoneriumRampReadiness, MoneriumWalletLinkResult } from "@vortexfi/kyc";

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
