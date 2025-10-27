import {
  AccountMeta,
  CreateQuoteRequest,
  EphemeralAccount,
  EphemeralAccountType,
  QuoteResponse,
  RampDirection,
  RampProcess,
  signUnsignedTransactions,
  UnsignedTx
} from "@packages/shared";
import { createMoonbeamEphemeral, createPendulumEphemeral, createStellarEphemeral } from "./ephemeralHelpers";
import { TransactionSigningError } from "./errors";
import { BrlHandler } from "./handlers/BrlHandler";
import { ApiService } from "./services/ApiService";
import { NetworkManager } from "./services/NetworkManager";
import { retrieveEphemeralKeys, storeEphemeralKeys } from "./storage";
import type {
  BrlOfframpAdditionalData,
  BrlOfframpUpdateAdditionalData,
  BrlOnrampAdditionalData,
  ExtendedQuoteResponse,
  RegisterRampAdditionalData,
  UpdateRampAdditionalData,
  VortexSdkConfig
} from "./types";

export class VortexSdk {
  private apiService: ApiService;
  private networkManager: NetworkManager;
  private brlHandler: BrlHandler;
  private initializationPromise: Promise<void>;
  private storeEphemeralKeys: boolean;

  constructor(config: VortexSdkConfig) {
    this.apiService = new ApiService(config.apiBaseUrl);
    this.networkManager = new NetworkManager(config);
    this.storeEphemeralKeys = config.storeEphemeralKeys ?? false;

    this.brlHandler = new BrlHandler(
      this.apiService,
      this,
      this.generateEphemerals.bind(this),
      this.signTransactions.bind(this)
    );

    this.initializationPromise = this.networkManager.waitForInitialization();
  }

  async createQuote<T extends CreateQuoteRequest>(request: T): Promise<ExtendedQuoteResponse<T>> {
    const baseQuote = await this.apiService.createQuote(request);
    return baseQuote as ExtendedQuoteResponse<T>;
  }

  async getQuote(quoteId: string): Promise<QuoteResponse> {
    return this.apiService.getQuote(quoteId);
  }

  async getRampStatus(rampId: string): Promise<RampProcess> {
    return this.apiService.getRampStatus(rampId);
  }

  async getUserTransactions(rampProcess: RampProcess, userAddress: string): Promise<UnsignedTx[]> {
    if (!rampProcess.unsignedTxs) {
      return [];
    }

    return rampProcess.unsignedTxs.filter(tx => tx.signer === userAddress);
  }

  async registerRamp<Q extends QuoteResponse>(
    quote: Q,
    additionalData: RegisterRampAdditionalData<Q>
  ): Promise<{
    rampProcess: RampProcess;
    unsignedTransactions: UnsignedTx[];
  }> {
    await this.ensureInitialized();

    let rampProcess: RampProcess;
    let unsignedTransactions: UnsignedTx[] = [];

    if (quote.rampType === RampDirection.BUY) {
      if (quote.from === "pix") {
        rampProcess = await this.brlHandler.registerBrlOnramp(quote.id, additionalData as BrlOnrampAdditionalData);
        unsignedTransactions = [];
      } else if (quote.from === "sepa") {
        throw new Error("Euro onramp handler not implemented yet");
      } else {
        throw new Error(`Unsupported onramp from: ${quote.from}`);
      }
    } else if (quote.rampType === RampDirection.SELL) {
      if (quote.to === "pix") {
        rampProcess = await this.brlHandler.registerBrlOfframp(quote.id, additionalData as BrlOfframpAdditionalData);
        const userAddress = (additionalData as BrlOfframpAdditionalData).walletAddress;
        unsignedTransactions = await this.getUserTransactions(rampProcess, userAddress);
      } else if (quote.to === "sepa") {
        throw new Error("Euro offramp handler not implemented yet");
      } else {
        throw new Error(`Unsupported offramp to: ${quote.to}`);
      }
    } else {
      throw new Error(`Unsupported ramp type: ${quote.rampType}`);
    }

    return { rampProcess, unsignedTransactions };
  }

  async updateRamp<Q extends QuoteResponse>(
    quote: Q,
    rampId: string,
    additionalUpdateData: UpdateRampAdditionalData<Q>
  ): Promise<RampProcess> {
    if (quote.rampType === RampDirection.BUY) {
      if (quote.from === "pix") {
        throw new Error("Brl onramp does not require any further data");
      } else if (quote.from === "sepa") {
        throw new Error("Euro onramp handler not implemented yet");
      }
    } else if (quote.rampType === RampDirection.SELL) {
      if (quote.to === "pix") {
        return this.brlHandler.updateBrlOfframp(rampId, additionalUpdateData as BrlOfframpUpdateAdditionalData);
      } else if (quote.to === "sepa") {
        throw new Error("Euro offramp handler not implemented yet");
      }
    }

    throw new Error(`Unsupported ramp type: ${quote.rampType} with from: ${quote.from}, to: ${quote.to}`);
  }

  async startRamp(rampId: string): Promise<RampProcess> {
    return this.brlHandler.startBrlRamp(rampId);
  }

  public async storeEphemerals(
    ephemerals: { [key in EphemeralAccountType]?: EphemeralAccount },
    rampId: string
  ): Promise<void> {
    if (!this.storeEphemeralKeys) {
      return;
    }

    for (const type of Object.keys(ephemerals) as EphemeralAccountType[]) {
      const ephemeral = ephemerals[type];
      if (ephemeral) {
        const { address, secret } = ephemeral;
        const key = `${type}_ephemeral_key`;
        const newKey = { address, rampId, secret };

        try {
          const existingKeys = (await retrieveEphemeralKeys(key)) || [];
          existingKeys.push(newKey);
          await storeEphemeralKeys(key, existingKeys);
        } catch (error) {
          console.error(`Error storing ephemeral key for ${type}:`, error);
        }
      }
    }
  }

  private async ensureInitialized(): Promise<void> {
    await this.initializationPromise;
  }

  private async generateEphemerals(): Promise<{
    ephemerals: { [key in EphemeralAccountType]?: EphemeralAccount };
    accountMetas: AccountMeta[];
  }> {
    const ephemerals: { [key in EphemeralAccountType]?: EphemeralAccount } = {};
    const accountMetas: AccountMeta[] = [];

    const stellarEphemeral = createStellarEphemeral();
    const substrateEphemeral = createPendulumEphemeral();
    const evmEphemeral = createMoonbeamEphemeral();

    accountMetas.push({
      address: stellarEphemeral.address,
      type: EphemeralAccountType.Stellar
    });
    ephemerals[EphemeralAccountType.Stellar] = stellarEphemeral;

    accountMetas.push({
      address: substrateEphemeral.address,
      type: EphemeralAccountType.Substrate
    });
    ephemerals[EphemeralAccountType.Substrate] = substrateEphemeral;

    accountMetas.push({
      address: evmEphemeral.address,
      type: EphemeralAccountType.EVM
    });
    ephemerals[EphemeralAccountType.EVM] = evmEphemeral;

    return { accountMetas, ephemerals };
  }

  private async signTransactions(
    unsignedTxs: UnsignedTx[],
    ephemerals: {
      stellarEphemeral?: EphemeralAccount;
      substrateEphemeral?: EphemeralAccount;
      evmEphemeral?: EphemeralAccount;
    }
  ): Promise<any[]> {
    await this.ensureInitialized();

    try {
      const signedTxs = await signUnsignedTransactions(
        unsignedTxs,
        ephemerals,
        this.networkManager.getPendulumApi() as any, // TODO fix typing
        this.networkManager.getMoonbeamApi() as any,
        this.networkManager.getHydrationApi() as any,
        this.networkManager.getAlchemyApiKey()
      );

      return signedTxs;
    } catch (error) {
      throw new TransactionSigningError(undefined, error as Error);
    }
  }
}
