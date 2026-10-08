import { concat, type Hex, keccak256, type PrivateKeyAccount, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { config } from "../../../config/vars";

/**
 * Each client's refund wallet: a plain key derived from MONERIUM_B2B_REFUND_SEED and the
 * client's Monerium profile ID. It is the forwarder's fixed `recoveryAddress`, is linked to
 * the client's Monerium profile, and redeems a refund out of the client's own IBAN. Keyed on
 * the profile, not the clone, so a replacement clone for the same client keeps the same
 * wallet (Monerium links an address to one profile only). One secret covers every client,
 * and the address is known before the forwarder is deployed.
 */
export function refundAccountFor(
  moneriumProfileId: string,
  seed: string | undefined = config.moneriumB2b.refundSeed
): PrivateKeyAccount {
  if (!seed) throw new Error("MONERIUM_B2B_REFUND_SEED is not configured");
  return privateKeyToAccount(keccak256(concat([seed as Hex, toHex(`vortex-b2b-refund:${moneriumProfileId.toLowerCase()}`)])));
}
