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

/**
 * Blockchain networks the stablecoin leg can settle on. EVM-only: AssetHub offramps
 * need a substrate wallet signature, which the dashboard's wagmi-only wallet can't
 * provide yet.
 */
export const TRANSFER_NETWORKS = [
  { id: "polygon", label: "Polygon" },
  { id: "arbitrum", label: "Arbitrum" },
  { id: "base", label: "Base" },
  { id: "ethereum", label: "Ethereum" }
] as const;

export function shortenAddress(address: string): string {
  if (address.length <= 12) {
    return address;
  }
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/**
 * Deterministic mock of a Vortex-created (Privy) deposit address. Derived from a seed
 * (recipient id) so the same recipient always sees the same payin wallet.
 */
export function mockPayinAddress(seed: string): string {
  const hex = "0123456789abcdef";
  // FNV-1a hash, then xorshift32 per nibble using the high bits (low bits cycle poorly).
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  let body = "";
  for (let i = 0; i < 40; i += 1) {
    h ^= (h << 13) >>> 0;
    h = h >>> 0;
    h ^= h >>> 17;
    h ^= (h << 5) >>> 0;
    h = h >>> 0;
    body += hex[(h >>> 28) & 0xf];
  }
  return `0x${body}`;
}
