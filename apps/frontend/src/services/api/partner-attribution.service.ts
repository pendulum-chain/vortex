import { apiRequest } from "./api-client";

export type PartnerAttributionClaimOutcome =
  | "created"
  | "no_partner_attribution"
  | "skipped_existing_assignment"
  | "skipped_partner_inactive"
  | "skipped_profile_missing";

export interface PartnerAttributionClaimResponse {
  outcome: PartnerAttributionClaimOutcome;
}

/**
 * Service for claiming partner pricing attribution from a public API key
 */
export class PartnerAttributionService {
  private static readonly BASE_PATH = "/partner-attribution";

  /**
   * Claims partner attribution for the authenticated user. The backend resolves the
   * partner from the public API key's credential; idempotent for repeated calls.
   */
  static async claim(apiKey: string): Promise<PartnerAttributionClaimResponse> {
    return apiRequest<PartnerAttributionClaimResponse>("post", `${PartnerAttributionService.BASE_PATH}/claim`, undefined, {
      headers: { "x-public-key": apiKey }
    });
  }
}
