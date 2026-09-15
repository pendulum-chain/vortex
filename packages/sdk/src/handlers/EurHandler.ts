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
import { MissingEurOnrampParametersError, MissingMykoboOfframpParametersError } from "../errors.js";
import type { ApiService } from "../services/ApiService.js";
import type {
  EurOfframpAdditionalData,
  EurOfframpUpdateAdditionalData,
  EurOnrampAdditionalData,
  RampHandler,
  VortexSdkContext
} from "../types.js";

/**
 * EUR/SEPA corridor adapter. BUY runs the Monerium onramp: the backend mints EURe to the wallet
 * linked to the user's Monerium profile and returns that wallet's ERC-2612 permit as a user-owned
 * transaction, which the integrator signs through `submitUserTransactions`. SELL keeps the legacy
 * Mykobo adapter for persisted flows; new EUR SELL quotes are rejected by the backend.
 */
export class EurHandler implements RampHandler {
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

  async registerEurOnramp(quoteId: string, additionalData: EurOnrampAdditionalData): Promise<RampProcess> {
    if (!additionalData.destinationAddress || !additionalData.walletAddress) {
      throw new MissingEurOnrampParametersError();
    }

    const { ephemerals, accountMetas } = await this.generateEphemerals();

    // Identity (profile, linked address, IBAN) is derived server-side; walletAddress names the
    // Monerium-linked owner whose permit comes back as a user-owned transaction.
    const registerRequest: RegisterRampRequest = {
      additionalData: {
        destinationAddress: additionalData.destinationAddress,
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

  async registerEurOfframp(quoteId: string, additionalData: EurOfframpAdditionalData): Promise<RampProcess> {
    if (
      !additionalData.walletAddress ||
      !additionalData.email ||
      !additionalData.ipAddress ||
      !additionalData.destinationAddress
    ) {
      throw new MissingMykoboOfframpParametersError();
    }

    const { ephemerals, accountMetas } = await this.generateEphemerals();

    const registerRequest: RegisterRampRequest = {
      additionalData: {
        destinationAddress: additionalData.destinationAddress,
        email: additionalData.email,
        ipAddress: additionalData.ipAddress,
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

  async updateEurOfframp(rampId: string, additionalData: EurOfframpUpdateAdditionalData): Promise<RampProcess> {
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
      presignedTxs: [],
      rampId: rampProcess.id
    };

    return this.apiService.updateRamp(updateRequest);
  }
}
