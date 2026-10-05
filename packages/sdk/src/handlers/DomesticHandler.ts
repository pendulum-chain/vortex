import { RampProcess } from "@vortexfi/shared";
import { MissingDomesticOfframpParametersError, MissingDomesticOnrampParametersError } from "../errors.js";
import type {
  DomesticOfframpAdditionalData,
  DomesticOfframpUpdateAdditionalData,
  DomesticOnrampAdditionalData
} from "../types.js";
import { BaseRampHandler } from "./BaseRampHandler.js";

export class DomesticHandler extends BaseRampHandler {
  async registerDomesticOnramp(quoteId: string, additionalData: DomesticOnrampAdditionalData): Promise<RampProcess> {
    if (!additionalData.destinationAddress) {
      throw new MissingDomesticOnrampParametersError();
    }

    return this.registerAndPresign(quoteId, {
      destinationAddress: additionalData.destinationAddress,
      fiatAccountId: additionalData.fiatAccountId,
      sessionId: additionalData.sessionId,
      walletAddress: additionalData.walletAddress
    });
  }

  async registerDomesticOfframp(quoteId: string, additionalData: DomesticOfframpAdditionalData): Promise<RampProcess> {
    if (!additionalData.fiatAccountId || !additionalData.walletAddress) {
      throw new MissingDomesticOfframpParametersError();
    }

    return this.registerAndPresign(quoteId, {
      fiatAccountId: additionalData.fiatAccountId,
      sessionId: additionalData.sessionId,
      walletAddress: additionalData.walletAddress
    });
  }

  async updateDomesticOfframp(rampId: string, additionalData: DomesticOfframpUpdateAdditionalData): Promise<RampProcess> {
    return this.updateOfframp(
      rampId,
      additionalData,
      currentPhase => `Ramp cannot be updated in its current phase. Expected initial phase, got: ${currentPhase}`
    );
  }
}
