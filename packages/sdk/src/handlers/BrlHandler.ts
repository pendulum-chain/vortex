import { RampDirection, RampProcess, UnsignedTx } from "@vortexfi/shared";
import { AmountExceedsLimitError, BrlKycStatusError, InvalidPixKeyError, VortexSdkError } from "../errors.js";
import type { BrlOfframpAdditionalData, BrlOfframpUpdateAdditionalData, BrlOnrampAdditionalData } from "../types.js";
import { BaseRampHandler } from "./BaseRampHandler.js";

export class BrlHandler extends BaseRampHandler {
  // BRL presigns every transaction the backend returns, not only the ephemeral-owned ones.
  protected selectTransactionsToSign(unsignedTxs: UnsignedTx[]): UnsignedTx[] {
    return unsignedTxs;
  }

  async registerBrlOnramp(quoteId: string, additionalData: BrlOnrampAdditionalData): Promise<RampProcess> {
    // taxId is now derived server-side from the bound user
    const taxId = additionalData.taxId ?? "";

    await this.assertWithinBrlLimit(taxId, quoteId, RampDirection.BUY);

    return this.registerAndPresign(quoteId, {
      destinationAddress: additionalData.destinationAddress,
      taxId: taxId || undefined
    });
  }

  async registerBrlOfframp(quoteId: string, additionalData: BrlOfframpAdditionalData): Promise<RampProcess> {
    const taxId = additionalData.taxId ?? "";
    const receiverTaxId = additionalData.receiverTaxId ?? taxId;

    await this.assertValidPixKey(additionalData.pixDestination);
    await this.assertWithinBrlLimit(taxId, quoteId, RampDirection.SELL);

    return this.registerAndPresign(quoteId, {
      pixDestination: additionalData.pixDestination,
      receiverTaxId: receiverTaxId || undefined,
      taxId: taxId || undefined,
      walletAddress: additionalData.walletAddress
    });
  }

  async updateBrlOfframp(rampId: string, additionalData: BrlOfframpUpdateAdditionalData): Promise<RampProcess> {
    return this.updateOfframp(rampId, additionalData);
  }

  private async assertValidPixKey(pixKey: string): Promise<void> {
    let result: { valid: boolean };
    try {
      result = await this.apiService.validateBrlPixKey(pixKey);
    } catch (error) {
      // Only treat client-side validation errors (4xx) as invalid PIX key.
      // Network/server errors (5xx, connection failures) must propagate so the
      // user retries instead of being told the key is invalid.
      if (error instanceof VortexSdkError && error.status >= 400 && error.status < 500) {
        throw new InvalidPixKeyError();
      }
      throw error;
    }
    if (!result.valid) {
      throw new InvalidPixKeyError();
    }
  }

  private async assertWithinBrlLimit(taxId: string, quoteId: string, direction: RampDirection): Promise<void> {
    const quote = await this.apiService.getQuote(quoteId);
    // BRL is the input on BUY (onramp) and the output on SELL (offramp).
    // On SELL, `outputAmount` is the user-received BRL (net of the anchor fee),
    // but the BRLA debit/limit applies to the gross amount before the anchor fee.
    // So we add `anchorFeeFiat` back to compare against the remaining limit.
    let brlAmount: number;
    if (direction === RampDirection.BUY) {
      brlAmount = Number(quote.inputAmount);
    } else {
      const net = Number(quote.outputAmount);
      const anchorFee = Number(quote.anchorFeeFiat ?? 0);
      brlAmount = net + (Number.isFinite(anchorFee) ? anchorFee : 0);
    }
    if (!Number.isFinite(brlAmount)) {
      throw new AmountExceedsLimitError();
    }
    let remainingLimit: number;
    try {
      ({ remainingLimit } = await this.apiService.getBrlRemainingLimit(taxId || undefined, direction));
    } catch (error) {
      // The backend returns 404 "Limits not found" for KYC-approved users whose
      // BRLA subaccount has not yet been initialized for limits. Treat this as
      // permissive (skip pre-flight) so legitimate users are not blocked; the
      // backend will enforce limits authoritatively during ramp execution.
      if (error instanceof VortexSdkError && error.status === 404) {
        return;
      }
      throw error;
    }
    if (brlAmount > remainingLimit) {
      throw new AmountExceedsLimitError();
    }
  }
}
