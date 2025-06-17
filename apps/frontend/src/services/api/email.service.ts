import { StoreEmailResponse } from "@packages/shared";
import { StoreEmailRequest } from "@packages/shared";
import { apiRequest } from "./api-client";

/**
 * Service for interacting with Email API endpoints
 */
export class EmailService {
  private static readonly BASE_PATH = "/email";

  /**
   * Store a user email
   * @param email The user's email address
   * @param transactionId The transaction ID
   * @returns Success message
   */
  static async storeEmail(email: string, transactionId: string): Promise<StoreEmailResponse> {
    const request: StoreEmailRequest = {
      timestamp: new Date().toISOString(),
      email,
      transactionId
    };
    return apiRequest<StoreEmailResponse>("post", `${this.BASE_PATH}/create`, request);
  }
}
