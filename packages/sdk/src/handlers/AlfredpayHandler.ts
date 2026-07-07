import {
  AccountMeta,
  EphemeralAccount,
  EphemeralAccountType,
  PresignedTx,
  RampProcess,
  RegisterRampRequest,
  UnsignedTx,
  UpdateRampRequest
} from "@vortexfi/shared";
import { MissingAlfredpayOfframpParametersError, MissingAlfredpayOnrampParametersError } from "../errors";
import type { ApiService } from "../services/ApiService";
import type {
  AlfredpayOfframpAdditionalData,
  AlfredpayOfframpUpdateAdditionalData,
  AlfredpayOnrampAdditionalData,
  RampHandler,
  VortexSdkContext
} from "../types";

export class AlfredpayHandler implements RampHandler {
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

  private getEphemeralTransactions(
    unsignedTxs: UnsignedTx[],
    ephemerals: { [key in EphemeralAccountType]?: EphemeralAccount }
  ): UnsignedTx[] {
    const ephemeralSigners = new Set(
      [ephemerals.EVM?.address, ephemerals.Substrate?.address]
        .filter((address): address is string => Boolean(address))
        .map(address => address.toLowerCase())
    );

    return unsignedTxs.filter(tx => ephemeralSigners.has(tx.signer.toLowerCase()));
  }

  async registerAlfredpayOnramp(quoteId: string, additionalData: AlfredpayOnrampAdditionalData): Promise<RampProcess> {
    if (!additionalData.destinationAddress) {
      throw new MissingAlfredpayOnrampParametersError();
    }

    const { ephemerals, accountMetas } = await this.generateEphemerals();

    const registerRequest: RegisterRampRequest = {
      additionalData: {
        destinationAddress: additionalData.destinationAddress,
        fiatAccountId: additionalData.fiatAccountId,
        sessionId: additionalData.sessionId,
        walletAddress: additionalData.walletAddress
      },
      quoteId,
      signingAccounts: accountMetas
    };

    const rampProcess = await this.apiService.registerRamp(registerRequest);

    await this.context.storeEphemerals(ephemerals, rampProcess.id);

    const ephemeralTxs = this.getEphemeralTransactions(rampProcess.unsignedTxs || [], ephemerals);
    const signedTxs = await this.signTransactions(ephemeralTxs, {
      evmEphemeral: ephemerals.EVM,
      substrateEphemeral: ephemerals.Substrate
    });

    const updateRequest: UpdateRampRequest = {
      additionalData: {},
      presignedTxs: signedTxs,
      rampId: rampProcess.id
    };

    return this.apiService.updateRamp(updateRequest);
  }

  async registerAlfredpayOfframp(quoteId: string, additionalData: AlfredpayOfframpAdditionalData): Promise<RampProcess> {
    if (!additionalData.fiatAccountId || !additionalData.walletAddress) {
      throw new MissingAlfredpayOfframpParametersError();
    }

    const { ephemerals, accountMetas } = await this.generateEphemerals();

    const registerRequest: RegisterRampRequest = {
      additionalData: {
        fiatAccountId: additionalData.fiatAccountId,
        sessionId: additionalData.sessionId,
        walletAddress: additionalData.walletAddress
      },
      quoteId,
      signingAccounts: accountMetas
    };

    const rampProcess = await this.apiService.registerRamp(registerRequest);

    await this.context.storeEphemerals(ephemerals, rampProcess.id);

    const ephemeralTxs = this.getEphemeralTransactions(rampProcess.unsignedTxs || [], ephemerals);
    const signedTxs = await this.signTransactions(ephemeralTxs, {
      evmEphemeral: ephemerals.EVM,
      substrateEphemeral: ephemerals.Substrate
    });

    const updateRequest: UpdateRampRequest = {
      additionalData: {},
      presignedTxs: signedTxs,
      rampId: rampProcess.id
    };

    return this.apiService.updateRamp(updateRequest);
  }

  async updateAlfredpayOfframp(rampId: string, additionalData: AlfredpayOfframpUpdateAdditionalData): Promise<RampProcess> {
    const rampProcess = await this.apiService.getRampStatus(rampId);
    if (rampProcess.currentPhase !== "initial") {
      throw new Error(`Ramp cannot be updated in its current phase. Expected initial phase, got: ${rampProcess.currentPhase}`);
    }

    const updateRequest: UpdateRampRequest = {
      additionalData: {
        assethubToPendulumHash: additionalData.assethubToPendulumHash,
        squidRouterApproveHash: additionalData.squidRouterApproveHash,
        squidRouterSwapHash: additionalData.squidRouterSwapHash
      },
      presignedTxs: [],
      rampId: rampProcess.id
    };

    return this.apiService.updateRamp(updateRequest);
  }
}
