import { RampProcess } from "@vortexfi/shared";
import { MissingEurOnrampParametersError, MissingMykoboOfframpParametersError } from "../errors.js";
import type { EurOfframpAdditionalData, EurOfframpUpdateAdditionalData, EurOnrampAdditionalData } from "../types.js";
import { BaseRampHandler } from "./BaseRampHandler.js";

/**
 * EUR/SEPA corridor adapter. BUY runs the Monerium onramp: the backend mints EURe to the wallet
 * linked to the user's Monerium profile and returns that wallet's ERC-2612 permit as a user-owned
 * transaction, which the integrator signs through `submitUserTransactions`. SELL keeps the legacy
 * Mykobo adapter for persisted flows; new EUR SELL quotes are rejected by the backend.
 */
export class EurHandler extends BaseRampHandler {
  async registerEurOnramp(quoteId: string, additionalData: EurOnrampAdditionalData): Promise<RampProcess> {
    if (!additionalData.destinationAddress || !additionalData.walletAddress) {
      throw new MissingEurOnrampParametersError();
    }

    // Identity (profile, linked address, IBAN) is derived server-side; walletAddress names the
    // Monerium-linked owner whose permit comes back as a user-owned transaction.
    return this.registerAndPresign(quoteId, {
      ...(additionalData.customerType ? { customerType: additionalData.customerType } : {}),
      destinationAddress: additionalData.destinationAddress,
      walletAddress: additionalData.walletAddress
    });
  }

  async registerEurOfframp(quoteId: string, additionalData: EurOfframpAdditionalData): Promise<RampProcess> {
    if (
      !additionalData.walletAddress ||
      !additionalData.email ||
      !additionalData.ipAddress ||
      !additionalData.destinationAddress
    ) {
      throw new MissingMykoboOfframpParametersError();
    }

    return this.registerAndPresign(quoteId, {
      destinationAddress: additionalData.destinationAddress,
      email: additionalData.email,
      ipAddress: additionalData.ipAddress,
      walletAddress: additionalData.walletAddress
    });
  }

  async updateEurOfframp(rampId: string, additionalData: EurOfframpUpdateAdditionalData): Promise<RampProcess> {
    return this.updateOfframp(rampId, additionalData);
  }
}
