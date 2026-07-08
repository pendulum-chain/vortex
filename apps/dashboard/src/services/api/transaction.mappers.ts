import { type GetRampHistoryTransaction, TransactionStatus as WireTransactionStatus } from "@vortexfi/shared";
import type { Transaction, TransactionStatus } from "@/domain/types";
import { CORRIDOR_BY_FIAT } from "./mappers";
import { type FiatToken, RampDirection } from "./types";

function mapStatus(status: WireTransactionStatus): TransactionStatus {
  if (status === WireTransactionStatus.COMPLETE) {
    return "completed";
  }
  if (status === WireTransactionStatus.FAILED) {
    return "failed";
  }
  return "processing";
}

/**
 * Maps a ramp-history entry to a dashboard transaction. Returns null for non-offramps or
 * payout currencies outside the supported corridors (nothing to render).
 */
export function mapRampHistoryTransaction(
  tx: GetRampHistoryTransaction,
  accountId: string,
  walletAddress: string
): Transaction | null {
  if (tx.type !== RampDirection.SELL) {
    return null;
  }
  const corridorId = CORRIDOR_BY_FIAT[tx.toCurrency as FiatToken];
  if (!corridorId) {
    return null;
  }
  return {
    accountId,
    amountIn: tx.fromAmount,
    amountInToken: String(tx.fromCurrency),
    corridorId,
    createdAt: tx.date,
    fiatPayoutAmount: tx.toAmount,
    id: tx.id,
    payinNetwork: String(tx.from),
    payinWallet: walletAddress,
    payoutCurrency: String(tx.toCurrency),
    recipientEmail: "",
    recipientId: "",
    status: mapStatus(tx.status)
  };
}
