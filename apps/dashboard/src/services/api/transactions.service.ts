import type { GetRampHistoryResponse } from "@vortexfi/shared";
import { apiClient } from "./api-client";

/**
 * Ramp history scoped server-side to the authenticated user across all wallet addresses.
 */
export const TransactionsService = {
  history(limit = 50): Promise<GetRampHistoryResponse> {
    return apiClient.get<GetRampHistoryResponse>("/ramp/history", { params: { limit } });
  }
};
