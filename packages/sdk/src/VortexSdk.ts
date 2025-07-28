import type {
  AccountMeta,
  CreateQuoteRequest,
  EphemeralAccount,
  QuoteResponse,
  RampProcess,
  UnsignedTx
} from "@packages/shared";
import { Networks, signUnsignedTransactions } from "@packages/shared";
import { createMoonbeamEphemeral, createPendulumEphemeral, createStellarEphemeral } from "./ephemeralHelpers";
import { EphemeralGenerationError, TransactionSigningError } from "./errors";
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

  private async ensureInitialized(): Promise<void> {
    await this.initializationPromise;
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

  async registerRamp<Q extends QuoteResponse>(quote: Q, additionalData: RegisterRampAdditionalData<Q>): Promise<RampProcess> {
    await this.ensureInitialized();

    if (quote.rampType === "on") {
      if (quote.from === "pix") {
        return this.brlHandler.registerBrlOnramp(quote.id, additionalData as BrlOnrampAdditionalData);
      } else if (quote.from === "sepa") {
        throw new Error("Euro onramp handler not implemented yet");
      }
    } else if (quote.rampType === "off") {
      if (quote.to === "pix") {
        return this.brlHandler.registerBrlOfframp(quote.id, additionalData as BrlOfframpAdditionalData);
      } else if (quote.to === "sepa") {
        throw new Error("Euro offramp handler not implemented yet");
      }
    }

    throw new Error(`Unsupported ramp type: ${quote.rampType} with from: ${quote.from}, to: ${quote.to}`);
  }

  async updateRamp<Q extends QuoteResponse>(
    quote: Q,
    rampId: string,
    additionalUpdateData: UpdateRampAdditionalData<Q>
  ): Promise<RampProcess> {
    if (quote.rampType === "on") {
      if (quote.from === "pix") {
        throw new Error("Brl onramp does not require any further data");
      } else if (quote.from === "sepa") {
        throw new Error("Euro onramp handler not implemented yet");
      }
    } else if (quote.rampType === "off") {
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

  public async storeEphemerals(ephemerals: { [key in Networks]?: EphemeralAccount }, rampId: string): Promise<void> {
    if (!this.storeEphemeralKeys) {
      return;
    }

    for (const network of Object.keys(ephemerals) as Networks[]) {
      const ephemeral = ephemerals[network];
      if (ephemeral) {
        const { address, secret } = ephemeral;
        const key = `${network}_ephemeral_key`;
        const newKey = { address, rampId, secret };

        try {
          const existingKeys = (await retrieveEphemeralKeys(key)) || [];
          existingKeys.push(newKey);
          await storeEphemeralKeys(key, existingKeys);
        } catch (error) {
          console.error(`Error storing ephemeral key for ${network}:`, error);
        }
      }
    }
  }

  private async generateEphemerals(networks: Networks[]): Promise<{
    ephemerals: { [key in Networks]?: EphemeralAccount };
    accountMetas: AccountMeta[];
  }> {
    const ephemerals: { [key in Networks]?: EphemeralAccount } = {};
    const accountMetas: AccountMeta[] = [];

    for (const network of networks) {
      try {
        let ephemeral: EphemeralAccount | undefined;
        switch (network) {
          case Networks.Stellar:
            ephemeral = createStellarEphemeral();
            ephemerals[Networks.Stellar] = ephemeral;
            break;
          case Networks.Pendulum:
            ephemeral = createPendulumEphemeral();
            ephemerals[Networks.Pendulum] = ephemeral;
            break;
          case Networks.Moonbeam:
            ephemeral = createMoonbeamEphemeral();
            ephemerals[Networks.Moonbeam] = ephemeral;
            break;
          default:
            console.warn(`Ephemeral generation not implemented for network: ${network}`);
        }

        if (ephemeral) {
          accountMetas.push({
            address: ephemeral.address,
            network
          });
        }
      } catch (error) {
        throw new EphemeralGenerationError(network, error as Error);
      }
    }

    return { accountMetas, ephemerals };
  }

  private async signTransactions(
    unsignedTxs: UnsignedTx[],
    ephemerals: {
      stellarEphemeral?: EphemeralAccount;
      pendulumEphemeral?: EphemeralAccount;
      moonbeamEphemeral?: EphemeralAccount;
    }
  ): Promise<any[]> {
    await this.ensureInitialized();

    try {
      const signedTxs = await signUnsignedTransactions(
        unsignedTxs,
        ephemerals,
        this.networkManager.getPendulumApi() as any, // TODO fix typing
        this.networkManager.getMoonbeamApi() as any,
        this.networkManager.getAlchemyApiKey()
      );

      return signedTxs;
    } catch (error) {
      throw new TransactionSigningError(undefined, error as Error);
    }
  }
}
