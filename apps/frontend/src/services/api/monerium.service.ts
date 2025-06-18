import { apiClient } from './api-client';

export interface MoneriumUserStatus {
  isNewUser: boolean;
}

export const MoneriumService = {
  /**
   * Check if a user exists in Monerium from our backend.
   */
  async checkUserStatus(address: string): Promise<MoneriumUserStatus> {
    try {
      return {
        isNewUser: false,
      };
      //TODO implement.

      const response = await apiClient.get(`/monerium/user-status`, {
        params: { address },
      });
      return response.data;
    } catch (error) {
      // If user doesn't exist, return isNewUser: true
      return {
        isNewUser: true,
      };
    }
  },

  /**
   * Validate Monerium auth tokens
   */
  async validateAuthTokens(authCode: string, codeVerifier: string): Promise<boolean> {
    try {
      const response = await apiClient.post('/monerium/validate-auth', {
        authCode,
        codeVerifier,
      });
      return response.data.valid;
    } catch (error) {
      console.error('Error validating Monerium auth tokens:', error);
      return false;
    }
  },
};
