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
import { BrlaHandler } from "./handlers/BrlaHandler";
import { ApiService } from "./services/ApiService";
import { NetworkManager } from "./services/NetworkManager";
import type {
  BrlaOnrampAdditionalData,
  ExtendedQuoteResponse,
  RegisterRampAdditionalData,
  UpdateRampAdditionalData,
  VortexSdkConfig
} from "./types";
export class VortexSdk {
  private apiService: ApiService;
  private networkManager: NetworkManager;
  private brlaHandler: BrlaHandler;
  private initializationPromise: Promise<void>;

  constructor(config: VortexSdkConfig) {
    this.apiService = new ApiService(config.apiBaseUrl);
    this.networkManager = new NetworkManager(config);

    this.brlaHandler = new BrlaHandler(
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

    // Determine which handler to use based on the quote parameters
    if (quote.rampType === "on") {
      if (quote.from === "pix") {
        return this.brlaHandler.registerBrlaOnramp(quote.id, additionalData as BrlaOnrampAdditionalData);
      } else if (quote.from === "sepa") {
        throw new Error("Euro onramp handler not implemented yet");
      }
    } else if (quote.rampType === "off") {
      if (quote.to === "pix") {
        throw new Error("BRLA offramp handler not implemented yet");
      } else if (quote.to === "sepa") {
        throw new Error("Euro offramp handler not implemented yet");
      }
    }

    throw new Error(`Unsupported ramp type: ${quote.rampType} with from: ${quote.from}, to: ${quote.to}`);
  }

  async updateRamp<Q extends QuoteResponse>(quote: Q, additionalUpdateData: UpdateRampAdditionalData<Q>): Promise<RampProcess> {
    if (quote.rampType === "on") {
      if (quote.from === "pix") {
        throw new Error("Brla onramp does not require any further data");
      } else if (quote.from === "sepa") {
        throw new Error("Euro onramp handler not implemented yet");
      }
    } else if (quote.rampType === "off") {
      if (quote.to === "pix") {
        throw new Error("BRLA offramp handler not implemented yet");
      } else if (quote.to === "sepa") {
        throw new Error("Euro offramp handler not implemented yet");
      }
    }

    throw new Error(`Unsupported ramp type: ${quote.rampType} with from: ${quote.from}, to: ${quote.to}`);
  }

  async startRamp<Q extends QuoteResponse>(quote: Q, rampId: string): Promise<RampProcess> {
    if (quote.rampType === "on") {
      if (quote.from === "pix") {
        return this.brlaHandler.startBrlaOnramp(rampId);
      } else if (quote.from === "sepa") {
        throw new Error("Euro onramp handler not implemented yet");
      }
    } else if (quote.rampType === "off") {
      if (quote.to === "pix") {
        throw new Error("BRLA offramp handler not implemented yet");
      } else if (quote.to === "sepa") {
        throw new Error("Euro offramp handler not implemented yet");
      }
    }

    throw new Error(`Unsupported ramp type: ${quote.rampType} with from: ${quote.from}, to: ${quote.to}`);
  }

  private async generateEphemerals(networks: Networks[]): Promise<{
    ephemerals: { [key in Networks]?: EphemeralAccount };
    accountMetas: AccountMeta[];
  }> {
    const ephemerals: { [key in Networks]?: EphemeralAccount } = {};
    const accountMetas: AccountMeta[] = [];

    for (const network of networks) {
      try {
        switch (network) {
          case Networks.Stellar:
            ephemerals[Networks.Stellar] = createStellarEphemeral();
            accountMetas.push({
              address: ephemerals[Networks.Stellar]!.address,
              network: Networks.Stellar
            });
            break;
          case Networks.Pendulum:
            ephemerals[Networks.Pendulum] = createPendulumEphemeral();
            accountMetas.push({
              address: ephemerals[Networks.Pendulum]!.address,
              network: Networks.Pendulum
            });
            break;
          case Networks.Moonbeam:
            ephemerals[Networks.Moonbeam] = createMoonbeamEphemeral();
            accountMetas.push({
              address: ephemerals[Networks.Moonbeam]!.address,
              network: Networks.Moonbeam
            });
            break;
          default:
            console.warn(`Ephemeral generation not implemented for network: ${network}`);
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
