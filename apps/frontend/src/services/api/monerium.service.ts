import { MONERIUM_MINT_NETWORK } from "../monerium/moneriumAuth";
import { apiClient, isApiError } from "./api-client";

export interface MoneriumUserStatus {
  isNewUser: boolean;
}

export const MoneriumService = {
  async checkUserStatus(address: string): Promise<MoneriumUserStatus> {
    try {
      console.log("Checking Monerium user status for address:", address);
      await apiClient.get("/monerium/address-exists", {
        params: { address, network: MONERIUM_MINT_NETWORK }
      });
      return { isNewUser: false };
    } catch (error: unknown) {
      if (isApiError(error)) {
        if (error.status === 404) {
          console.log("Monerium user not found");
          return { isNewUser: true };
        }
        throw new Error(`Error checking Monerium user status: ${error.message}`);
      }
      throw new Error(`An unexpected error occurred: ${error}`);
    }
  },

  async createRampMessage(amount: string, iban: string): Promise<string> {
    const date = new Date(Date.now() + 1000 * 60 * 10).toISOString();
    return `Send EUR ${amount} to ${iban} at ${date}`;
  },

  async validateAuthTokens(authCode: string, codeVerifier: string): Promise<boolean> {
    try {
      const data = await apiClient.post<{ valid: boolean }>("/monerium/validate-auth", { authCode, codeVerifier });
      return data.valid;
    } catch (error) {
      console.error("Error validating Monerium auth tokens:", error);
      return false;
    }
  }
};
