import axios from "axios";
import { MONERIUM_MINT_NETWORK } from "../monerium/moneriumAuth";
import { apiClient } from "./api-client";

export interface MoneriumUserStatus {
  isNewUser: boolean;
}

export const MoneriumService = {
  /**
   * Check if a user exists in Monerium from our backend.
   */
  async checkUserStatus(address: string): Promise<MoneriumUserStatus> {
    try {
      console.log("Checking Monerium user status for address:", address);
      await apiClient.get("/monerium/address-exists", {
        params: { address, network: MONERIUM_MINT_NETWORK }
      });
      return {
        isNewUser: false
      };
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        if (error.response && error.response.status === 404) {
          console.log("Monerium user not found");
          return {
            isNewUser: true
          };
        }
        throw new Error(`Error checking Monerium user status: ${error.message}`);
      }
      throw new Error(`An unexpected error occurred: ${error}`);
    }
  },

  /**
   * Create signature for Monerium offrampm, 10 minutes from now.
   */
  async createRampMessage(amount: string, iban: string): Promise<string> {
    const date = new Date(Date.now() + 1000 * 60 * 10).toISOString();
    return `Send EUR ${amount} to ${iban} at ${date}`;
  },

  /**
   * Validate Monerium auth tokens
   */
  async validateAuthTokens(authCode: string, codeVerifier: string): Promise<boolean> {
    try {
      const response = await apiClient.post("/monerium/validate-auth", {
        authCode,
        codeVerifier
      });
      return response.data.valid;
    } catch (error) {
      console.error("Error validating Monerium auth tokens:", error);
      return false;
    }
  }
};
