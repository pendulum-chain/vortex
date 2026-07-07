import type { Recipient } from "@/domain/types";
import type { RegisterTransferInput } from "./transfer.actors";

/**
 * Offramp additionalData per corridor, ported from the widget's
 * buildRegisterRampAdditionalData (SELL branches). Alfredpay corridors need a
 * provider `fiatAccountId` and BRL a `receiverTaxId` — both come from the recipient's
 * payout reference once the §7.1 payout-instrument capture lands; until then those
 * corridors register with what the dashboard knows and the backend rejects them.
 */
export function buildTransferAdditionalData(
  recipient: Recipient,
  walletAddress: string
): RegisterTransferInput["additionalData"] {
  switch (recipient.corridorId) {
    case "EU":
      return {
        destinationAddress: recipient.bankDetails.value,
        email: recipient.email || undefined,
        walletAddress
      };
    case "BR":
      return {
        pixDestination: recipient.bankDetails.value,
        walletAddress
      };
    default:
      return { walletAddress };
  }
}
