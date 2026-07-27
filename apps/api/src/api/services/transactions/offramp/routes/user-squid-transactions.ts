import type { EvmTransactionData, Networks, UnsignedTx } from "@vortexfi/shared";

interface UserSquidTransactionsInput {
  approveData: EvmTransactionData;
  approvePhase: UnsignedTx["phase"];
  isNative: boolean;
  network: Networks;
  signer: string;
  swapData: EvmTransactionData;
  swapPhase: UnsignedTx["phase"];
}

export function buildUserSquidTransactions(input: UserSquidTransactionsInput): UnsignedTx[] {
  const transactions: UnsignedTx[] = [];
  if (!input.isNative) {
    transactions.push({
      meta: {},
      network: input.network,
      nonce: 0,
      phase: input.approvePhase,
      signer: input.signer,
      txData: input.approveData
    });
  }
  transactions.push({
    meta: {},
    network: input.network,
    nonce: input.isNative ? 0 : 1,
    phase: input.swapPhase,
    signer: input.signer,
    txData: input.swapData
  });
  return transactions;
}
