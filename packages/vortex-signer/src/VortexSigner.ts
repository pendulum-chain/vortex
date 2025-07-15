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
import type { BrlaOnrampAdditionalData, VortexSignerConfig, VortexSignerContext } from "./types";

export class VortexSigner {
  private apiService: ApiService;
  private networkManager: NetworkManager;
  private brlaHandler: BrlaHandler;
  private initializationPromise: Promise<void>;

  constructor(config: VortexSignerConfig) {
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

  async createQuote(request: CreateQuoteRequest): Promise<QuoteResponse> {
    return this.apiService.createQuote(request);
  }

  async getQuote(quoteId: string): Promise<QuoteResponse> {
    return this.apiService.getQuote(quoteId);
  }

  async getRampStatus(rampId: string): Promise<RampProcess> {
    return this.apiService.getRampStatus(rampId);
  }

  async registerBrlaOnramp(quoteId: string, additionalData: BrlaOnrampAdditionalData): Promise<RampProcess> {
    return this.brlaHandler.registerBrlaOnramp(quoteId, additionalData);
  }

  async startBrlaOnramp(rampId: string): Promise<RampProcess> {
    return this.brlaHandler.startBrlaOnramp(rampId);
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
