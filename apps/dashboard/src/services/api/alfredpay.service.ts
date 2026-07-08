import type { AlfredpayListFiatAccountsResponse } from "@vortexfi/shared";
import { apiClient } from "./api-client";

/**
 * The user's saved AlfredPay payout accounts for a country (US/MX/CO/AR). Each account's
 * `fiatAccountId` is the offramp payout target — the dashboard turns each into a
 * "send to yourself" recipient. 404s when the caller has no AlfredPay customer yet.
 */
export const AlfredpayService = {
  listFiatAccounts(country: string, signal?: AbortSignal): Promise<AlfredpayListFiatAccountsResponse> {
    return apiClient.get<AlfredpayListFiatAccountsResponse>("/alfredpay/fiatAccounts", { params: { country }, signal });
  }
};
