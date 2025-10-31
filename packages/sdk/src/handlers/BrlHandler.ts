import {
  AccountMeta,
  EphemeralAccount,
  EphemeralAccountType,
  RampProcess,
  RegisterRampRequest,
  UnsignedTx,
  UpdateRampRequest
} from "@vortexfi/shared";
import { BrlKycStatusError } from "../errors";
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
      stellarEphemeral?: EphemeralAccount;
      substrateEphemeral?: EphemeralAccount;
      evmEphemeral?: EphemeralAccount;
    }
  ) => Promise<any[]>;

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
        stellarEphemeral?: EphemeralAccount;
        substrateEphemeral?: EphemeralAccount;
        evmEphemeral?: EphemeralAccount;
      }
    ) => Promise<any[]>
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
      stellarEphemeral: ephemerals.Stellar,
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
      stellarEphemeral: ephemerals.Stellar,
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

  async startBrlRamp(rampId: string): Promise<RampProcess> {
    const startRequest = { rampId };
    return this.apiService.startRamp(startRequest);
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
}
