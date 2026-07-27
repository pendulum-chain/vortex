import { Networks } from "@vortexfi/shared";
import type { RecipientMethod } from "./types";

/** Display label for the fiat rail each corridor settles on. */
export const PAYMENT_METHOD_LABEL: Record<RecipientMethod, string> = {
  ach: "ACH",
  iban: "SEPA",
  pix: "PIX",
  spei: "SPEI"
};

/**
 * Blockchain networks the stablecoin leg can settle on. EVM-only: AssetHub offramps
 * need a substrate wallet signature, which the dashboard's wagmi-only wallet can't
 * provide yet.
 */
export const TRANSFER_NETWORKS = [
  { id: Networks.Polygon, label: "Polygon" },
  { id: Networks.Arbitrum, label: "Arbitrum" },
  { id: Networks.Base, label: "Base" },
  { id: Networks.Ethereum, label: "Ethereum" },
  { id: Networks.Avalanche, label: "Avalanche" },
  { id: Networks.BSC, label: "BNB Smart Chain" }
] as const;

export function shortenAddress(address: string): string {
  if (address.length <= 12) {
    return address;
  }
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
