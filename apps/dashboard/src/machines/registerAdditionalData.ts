import type { Recipient } from "@/domain/types";
import type { RegisterTransferInput } from "./transfer.actors";

/**
 * Offramp additionalData per corridor for a self-recipient, ported from the widget's
 * buildRegisterRampAdditionalData (SELL branches). The backend derives everything tied to
 * the authenticated user's provider identity, so the dashboard only supplies the payout
 * target it can't derive:
 *   - AlfredPay (US/MX/CO/AR): the saved `fiatAccountId` from the fetched payout account.
 *   - BRL (Avenia): the destination `pixDestination` (the user's own PIX key). `taxId` and
 *     `receiverTaxId` are derived server-side from the user's Avenia account.
 *   - EU (Mykobo): nothing but the receiving `walletAddress` — the anchor email is derived
 *     from the user's profile. (EUR ramps are gated by a server kill-switch today.)
 */
export function buildTransferAdditionalData(
  recipient: Recipient,
  walletAddress: string,
  pixKey?: string
): RegisterTransferInput["additionalData"] {
  switch (recipient.corridorId) {
    case "EU":
      return {
        destinationAddress: walletAddress,
        walletAddress
      };
    case "BR":
      return {
        pixDestination: pixKey,
        walletAddress
      };
    default:
      return {
        ...(recipient.fiatAccountId ? { fiatAccountId: recipient.fiatAccountId } : {}),
        walletAddress
      };
  }
}
