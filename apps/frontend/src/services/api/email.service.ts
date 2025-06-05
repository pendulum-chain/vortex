import { EmailEndpoints } from 'shared';
import { apiRequest } from './api-client';

/**
 * Service for interacting with Email API endpoints
 */
export class EmailService {
  private static readonly BASE_PATH = '/email';

  /**
   * Store a user email
   * @param email The user's email address
   * @param transactionId The transaction ID
   * @returns Success message
   */
  static async storeEmail(email: string, transactionId: string): Promise<EmailEndpoints.StoreEmailResponse> {
    const request: EmailEndpoints.StoreEmailRequest = {
      timestamp: new Date().toISOString(),
      email,
      transactionId,
    };
    return apiRequest<EmailEndpoints.StoreEmailResponse>('post', `${this.BASE_PATH}/create`, request);
  }
}
