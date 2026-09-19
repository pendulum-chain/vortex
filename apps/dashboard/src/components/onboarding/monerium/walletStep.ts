import type { MoneriumRampReadiness, MoneriumWalletLinkResult } from "@vortexfi/kyc";
import type { Onboarding } from "@/domain/types";

export const MONERIUM_STATUS_POLL_INTERVAL_MS = 5_000;
/** 36 polls of 5 s, about three minutes: the same bound the widget's wallet machine applies. */
export const MONERIUM_STATUS_MAX_POLLS = 36;

/** Poll until the connected wallet holds the IBAN; stop on an error, without a wallet, or once the wait has run too long. */
export function moneriumStatusPollInterval(input: {
  address: string | undefined;
  error: unknown;
  polls: number;
  ramp: MoneriumRampReadiness | undefined;
}): number | false {
  if (input.error || !input.address || input.polls >= MONERIUM_STATUS_MAX_POLLS) return false;
  const provisionedHere =
    input.ramp?.iban === "provisioned" && input.ramp.linkedAddress?.toLowerCase() === input.address.toLowerCase();
  return provisionedHere ? false : MONERIUM_STATUS_POLL_INTERVAL_MS;
}

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
