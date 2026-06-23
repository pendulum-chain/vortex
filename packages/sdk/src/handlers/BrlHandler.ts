import {
  AccountMeta,
  EphemeralAccount,
  EphemeralAccountType,
  PresignedTx,
  RampDirection,
  RampProcess,
  RegisterRampRequest,
  UnsignedTx,
  UpdateRampRequest
} from "@vortexfi/shared";
import { AmountExceedsLimitError, BrlKycStatusError, InvalidPixKeyError, VortexSdkError } from "../errors";
import type { ApiService } from "../services/ApiService";
import type {
  BrlOfframpAdditionalData,
  BrlOfframpUpdateAdditionalData,
  BrlOnrampAdditionalData,
  RampHandler,
  VortexSdkContext
} from "../types";

export class BrlHandler implements RampHandler {
  private apiService: ApiService;
  private context: VortexSdkContext;
  private generateEphemerals: () => Promise<{
    ephemerals: { [key in EphemeralAccountType]?: EphemeralAccount };
    accountMetas: AccountMeta[];
  }>;
  private signTransactions: (
    unsignedTxs: UnsignedTx[],
    ephemerals: {
      substrateEphemeral?: EphemeralAccount;
      evmEphemeral?: EphemeralAccount;
    }
  ) => Promise<PresignedTx[]>;

  constructor(
    apiService: ApiService,
    context: VortexSdkContext,
    generateEphemerals: () => Promise<{
      ephemerals: { [key in EphemeralAccountType]?: EphemeralAccount };
      accountMetas: AccountMeta[];
    }>,
    signTransactions: (
      unsignedTxs: UnsignedTx[],
      ephemerals: {
        substrateEphemeral?: EphemeralAccount;
        evmEphemeral?: EphemeralAccount;
      }
    ) => Promise<PresignedTx[]>
  ) {
    this.apiService = apiService;
    this.context = context;
    this.generateEphemerals = generateEphemerals;
    this.signTransactions = signTransactions;
  }

  async registerBrlOnramp(quoteId: string, additionalData: BrlOnrampAdditionalData): Promise<RampProcess> {
    if (!additionalData.taxId) {
      throw new Error("Tax ID is required for BRL onramp");
    }

    await this.validateBrlKyc(additionalData.taxId);
    await this.assertWithinBrlLimit(additionalData.taxId, quoteId, RampDirection.BUY);

    const { ephemerals, accountMetas } = await this.generateEphemerals();

    const registerRequest: RegisterRampRequest = {
      additionalData: {
        destinationAddress: additionalData.destinationAddress,
        taxId: additionalData.taxId
      },
      quoteId,
      signingAccounts: accountMetas
    };

    const rampProcess = await this.apiService.registerRamp(registerRequest);

    await this.context.storeEphemerals(ephemerals, rampProcess.id);

    const signedTxs = await this.signTransactions(rampProcess.unsignedTxs || [], {
      evmEphemeral: ephemerals.EVM,
      substrateEphemeral: ephemerals.Substrate
    });

    const updateRequest: UpdateRampRequest = {
      additionalData: {},
      presignedTxs: signedTxs,
      rampId: rampProcess.id
    };

    const updatedRampProcess = await this.apiService.updateRamp(updateRequest);

    return updatedRampProcess;
  }

  async registerBrlOfframp(quoteId: string, additionalData: BrlOfframpAdditionalData): Promise<RampProcess> {
    if (!additionalData.taxId) {
      throw new Error("Tax ID is required for BRL offramps");
    }

    await this.validateBrlKyc(additionalData.taxId);
    await this.assertValidPixKey(additionalData.pixDestination);
    await this.assertWithinBrlLimit(additionalData.taxId, quoteId, RampDirection.SELL);

    const { ephemerals, accountMetas } = await this.generateEphemerals();

    const registerRequest: RegisterRampRequest = {
      additionalData: {
        pixDestination: additionalData.pixDestination,
        receiverTaxId: additionalData.receiverTaxId,
        taxId: additionalData.taxId,
        walletAddress: additionalData.walletAddress
      },
      quoteId,
      signingAccounts: accountMetas
    };

    const rampProcess = await this.apiService.registerRamp(registerRequest);

    await this.context.storeEphemerals(ephemerals, rampProcess.id);

    const signedTxs = await this.signTransactions(rampProcess.unsignedTxs || [], {
      evmEphemeral: ephemerals.EVM,
      substrateEphemeral: ephemerals.Substrate
    });

    const updateRequest: UpdateRampRequest = {
      additionalData: {},
      presignedTxs: signedTxs,
      rampId: rampProcess.id
    };

    const updatedRampProcess = await this.apiService.updateRamp(updateRequest);

    return updatedRampProcess;
  }

  async updateBrlOfframp(rampId: string, additionalData: BrlOfframpUpdateAdditionalData): Promise<RampProcess> {
    const rampProcess = await this.apiService.getRampStatus(rampId);
    if (rampProcess.currentPhase !== "initial") {
      throw new Error(
        `Invalid ramp id. Ramp must be on initial phase to be updated. Current phase: ${rampProcess.currentPhase}`
      );
    }

    const updateRequest: UpdateRampRequest = {
      additionalData: {
        assethubToPendulumHash: additionalData.assethubToPendulumHash,
        squidRouterApproveHash: additionalData.squidRouterApproveHash,
        squidRouterSwapHash: additionalData.squidRouterSwapHash
      },
      presignedTxs: [], // Presigned transactions are sent during the initial update, on the registerBrlOfframp of this class.
      rampId: rampProcess.id
    };

    const updatedRampProcess = await this.apiService.updateRamp(updateRequest);
    return updatedRampProcess;
  }

  private async validateBrlKyc(taxId: string): Promise<void> {
    if (!taxId) {
      throw new BrlKycStatusError("Tax ID is required", 400);
    }

    const kycStatus = await this.apiService.getBrlKycStatus(taxId);
    if (kycStatus.kycLevel < 1) {
      throw new Error(`Insufficient KYC level. Current: ${kycStatus.kycLevel}`);
    }
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
      ({ remainingLimit } = await this.apiService.getBrlRemainingLimit(taxId, direction));
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
