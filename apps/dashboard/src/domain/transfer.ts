import type { CorridorId, RecipientMethod } from "./types";

/** Mock FX rate: units of the corridor's fiat currency per 1 USDC. */
export const USDC_RATES: Record<CorridorId, number> = {
  AR: 950,
  BR: 5.47,
  CO: 4000,
  EU: 0.92,
  MX: 18.5,
  US: 1.0
};

/** Display label for the fiat rail each corridor settles on. */
export const PAYMENT_METHOD_LABEL: Record<RecipientMethod, string> = {
  ach: "ACH",
  iban: "SEPA",
  pix: "PIX",
  spei: "SPEI"
};

/** Blockchain networks the stablecoin leg can settle on. */
export const TRANSFER_NETWORKS = [
  { id: "polygon", label: "Polygon" },
  { id: "arbitrum", label: "Arbitrum" },
  { id: "base", label: "Base" },
  { id: "ethereum", label: "Ethereum" },
  { id: "assethub", label: "Polkadot AssetHub" }
] as const;

export function shortenAddress(address: string): string {
  if (address.length <= 12) {
    return address;
  }
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
