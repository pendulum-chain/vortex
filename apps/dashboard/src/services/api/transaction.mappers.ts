import {
  type FiatToken,
  type GetRampHistoryTransaction,
  RampDirection,
  TransactionStatus as WireTransactionStatus
} from "@vortexfi/shared";
import type { Transaction, TransactionStatus } from "@/domain/types";
import { CORRIDOR_BY_FIAT } from "./mappers";

export function mapTransactionStatus(tx: Pick<GetRampHistoryTransaction, "currentPhase" | "status">): TransactionStatus {
  if (tx.currentPhase === "timedOut") {
    return "cancelled";
  }
  if (tx.status === WireTransactionStatus.COMPLETE) {
    return "completed";
  }
  if (tx.status === WireTransactionStatus.FAILED) {
    return "failed";
  }
  return "processing";
}

/**
 * Maps onramps and offramps into the dashboard's source/destination transaction shape.
 */
export function mapRampHistoryTransaction(tx: GetRampHistoryTransaction, accountId: string): Transaction | null {
  const isOnramp = tx.type === RampDirection.BUY;
  const corridorId = CORRIDOR_BY_FIAT[(isOnramp ? tx.fromCurrency : tx.toCurrency) as FiatToken];
  if (!corridorId) {
    return null;
  }
  return {
    accountId,
    amountIn: tx.fromAmount,
    amountInToken: String(tx.fromCurrency),
    corridorId,
    createdAt: tx.date,
    direction: tx.type,
    fiatPayoutAmount: tx.toAmount,
    id: tx.id,
    payinNetwork: String(isOnramp ? tx.to : tx.from),
    payinWallet: tx.walletAddress ?? "",
    payoutCurrency: String(tx.toCurrency),
    recipientEmail: isOnramp ? "Your wallet" : "Payout account",
    recipientId: "",
    status: mapTransactionStatus(tx)
  };
}
