import type {
  AccountMeta,
  EphemeralAccount,
  EphemeralAccountType,
  PresignedTx,
  RampProcess,
  RegisterRampRequest,
  UnsignedTx
} from "@vortexfi/shared";
import type { ApiService } from "../services/ApiService.js";
import type { OfframpUpdateAdditionalData, RampHandler, VortexSdkContext } from "../types.js";

type Ephemerals = { [key in EphemeralAccountType]?: EphemeralAccount };

/**
 * The register -> store ephemerals -> sign -> update sequence and the offramp hash update shared by
 * the corridor handlers. Each handler keeps its own validation and `additionalData` mapping.
 */
export abstract class BaseRampHandler implements RampHandler {
  constructor(
    protected readonly apiService: ApiService,
    protected readonly context: VortexSdkContext,
    private readonly generateEphemerals: () => Promise<{ ephemerals: Ephemerals; accountMetas: AccountMeta[] }>,
    private readonly signTransactions: (
      unsignedTxs: UnsignedTx[],
      ephemerals: {
        substrateEphemeral?: EphemeralAccount;
        evmEphemeral?: EphemeralAccount;
      }
    ) => Promise<PresignedTx[]>
  ) {}

  /** Which of the backend's unsigned transactions get presigned. Defaults to the ephemeral-owned ones. */
  protected selectTransactionsToSign(unsignedTxs: UnsignedTx[], ephemerals: Ephemerals): UnsignedTx[] {
    const ephemeralSigners = new Set(
      [ephemerals.EVM?.address, ephemerals.Substrate?.address]
        .filter((address): address is string => Boolean(address))
        .map(address => address.toLowerCase())
    );

    return unsignedTxs.filter(tx => ephemeralSigners.has(tx.signer.toLowerCase()));
  }

  protected async registerAndPresign(
    quoteId: string,
    additionalData: RegisterRampRequest["additionalData"]
  ): Promise<RampProcess> {
    const { ephemerals, accountMetas } = await this.generateEphemerals();

    const rampProcess = await this.apiService.registerRamp({
      additionalData,
      quoteId,
      signingAccounts: accountMetas
    });

    await this.context.storeEphemerals(ephemerals, rampProcess.id);

    const signedTxs = await this.signTransactions(this.selectTransactionsToSign(rampProcess.unsignedTxs || [], ephemerals), {
      evmEphemeral: ephemerals.EVM,
      substrateEphemeral: ephemerals.Substrate
    });

    return this.apiService.updateRamp({
      additionalData: {},
      presignedTxs: signedTxs,
      rampId: rampProcess.id
    });
  }

  protected async updateOfframp(
    rampId: string,
    additionalData: OfframpUpdateAdditionalData,
    invalidPhaseMessage: (currentPhase: string) => string = currentPhase =>
      `Invalid ramp id. Ramp must be on initial phase to be updated. Current phase: ${currentPhase}`
  ): Promise<RampProcess> {
    const rampProcess = await this.apiService.getRampStatus(rampId);
    if (rampProcess.currentPhase !== "initial") {
      throw new Error(invalidPhaseMessage(rampProcess.currentPhase));
    }

    return this.apiService.updateRamp({
      additionalData: {
        assethubToPendulumHash: additionalData.assethubToPendulumHash,
        squidRouterApproveHash: additionalData.squidRouterApproveHash,
        squidRouterSwapHash: additionalData.squidRouterSwapHash
      },
      // Presigned transactions are sent with the initial update, in the register call.
      presignedTxs: [],
      rampId: rampProcess.id
    });
  }
}
