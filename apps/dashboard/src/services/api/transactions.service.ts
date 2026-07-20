import type { GetRampHistoryResponse } from "@vortexfi/shared";
import { apiClient } from "./api-client";

/**
 * Ramp (transaction) history for a wallet, scoped server-side to the authenticated owner.
 * The dashboard shows the connected wallet's payouts.
 */
export const TransactionsService = {
  history(walletAddress: string, limit = 50): Promise<GetRampHistoryResponse> {
    return apiClient.get<GetRampHistoryResponse>(`/ramp/history/${walletAddress}`, { params: { limit } });
  }
};
