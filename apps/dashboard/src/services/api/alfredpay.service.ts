import { type AlfredpayKycApi, createAlfredpayKycApi } from "@vortexfi/kyc";
import type { AlfredpayListFiatAccountsResponse } from "@vortexfi/shared";
import { apiClient } from "./api-client";

/**
 * The dashboard's Alfredpay endpoints. The KYC subset satisfies `AlfredpayKycApi`, which is what
 * `createAlfredpayKycMachine` verifies senders with. The KYB methods are part of that port but are
 * unreachable from the dashboard today: `OnboardingWizard` only drives the machine for individual
 * KYC, so company accounts still use the mocked wizard.
 */
export const AlfredpayService: AlfredpayKycApi & {
  listFiatAccounts(country: string, signal?: AbortSignal): Promise<AlfredpayListFiatAccountsResponse>;
} = {
  ...createAlfredpayKycApi(apiClient),

  /**
   * The user's saved AlfredPay payout accounts for a country (US/MX/CO/AR). Each account's
   * `fiatAccountId` is the offramp payout target — the dashboard turns each into a
   * "send to yourself" recipient. 404s when the caller has no AlfredPay customer yet.
   */
  listFiatAccounts(country: string, signal?: AbortSignal): Promise<AlfredpayListFiatAccountsResponse> {
    return apiClient.get<AlfredpayListFiatAccountsResponse>("/alfredpay/fiatAccounts", { params: { country }, signal });
  }
};
