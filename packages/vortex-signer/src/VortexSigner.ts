import type { CreateQuoteRequest, EphemeralAccount, QuoteResponse } from "@packages/shared";
import { Networks } from "@packages/shared";
import type {
  AccountMeta,
  RampProcess,
  RegisterRampRequest,
  RegisterRampResponse,
  StartRampRequest,
  StartRampResponse,
  UnsignedTx,
  UpdateRampRequest,
  UpdateRampResponse
} from "../../shared/src/endpoints/ramp.endpoints";
import { signUnsignedTransactions } from "../../shared/src/helpers/signUnsigned";
import { createMoonbeamEphemeral, createPendulumEphemeral, createStellarEphemeral } from "./ephemeralHelpers";
import { EphemeralGenerationError, RampStateNotFoundError, TransactionSigningError } from "./errors";
import { BrlaHandler } from "./handlers/BrlaHandler";
import { ApiService } from "./services/ApiService";
import { NetworkManager } from "./services/NetworkManager";
import type { BrlaOnrampAdditionalData, RampState, VortexSignerConfig, VortexSignerContext } from "./types";

export class VortexSigner implements VortexSignerContext {
  private config: VortexSignerConfig;
  private rampStates: Map<string, RampState> = new Map();
  private apiService: ApiService;
  private networkManager: NetworkManager;
  private brlaHandler: BrlaHandler;

  constructor(config: VortexSignerConfig) {
    this.config = config;
    this.apiService = new ApiService(config.apiBaseUrl);
    this.networkManager = new NetworkManager(config);

    this.brlaHandler = new BrlaHandler(this.apiService, this, this.registerRamp.bind(this), this.updateRamp.bind(this));

    console.log("VortexSigner initialized with config:", config);
  }

  async waitForInitialization(): Promise<void> {
    await this.networkManager.waitForInitialization();
  }

  async createQuote(request: CreateQuoteRequest): Promise<QuoteResponse> {
    return this.apiService.createQuote(request);
  }

  async getQuote(quoteId: string): Promise<QuoteResponse> {
    return this.apiService.getQuote(quoteId);
  }

  async getRampStatus(rampId: string): Promise<RampProcess> {
    const rampProcess = await this.apiService.getRampStatus(rampId);

    const existingState = this.rampStates.get(rampProcess.id);
    if (existingState) {
      existingState.currentPhase = rampProcess.currentPhase;
    }

    return rampProcess;
  }

  async registerBrlaOnramp(quoteId: string, additionalData: BrlaOnrampAdditionalData): Promise<RampProcess> {
    return this.brlaHandler.registerBrlaOnramp(quoteId, additionalData);
  }

  async startBrlaOnramp(rampId: string): Promise<RampProcess> {
    return this.brlaHandler.startBrlaOnramp(rampId);
  }

  async generateEphemerals(networks: Networks[]): Promise<{
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

  async signTransactions(rampId: string, unsignedTxs: UnsignedTx[]): Promise<any[]> {
    await this.waitForInitialization();

    const rampState = this.rampStates.get(rampId);
    if (!rampState) {
      throw new RampStateNotFoundError(rampId);
    }

    try {
      const signedTxs = await signUnsignedTransactions(
        unsignedTxs,
        rampState.ephemerals,
        this.networkManager.getPendulumApi() as any, // TODO fix typing
        this.networkManager.getMoonbeamApi() as any,
        this.networkManager.getAlchemyApiKey()
      );

      return signedTxs;
    } catch (error) {
      throw new TransactionSigningError(undefined, error as Error);
    }
  }

  setEphemerals(
    rampId: string,
    ephemerals: {
      stellarEphemeral?: EphemeralAccount;
      pendulumEphemeral?: EphemeralAccount;
      moonbeamEphemeral?: EphemeralAccount;
    }
  ): void {
    const rampState = this.rampStates.get(rampId);
    if (!rampState) {
      throw new RampStateNotFoundError(rampId);
    }

    rampState.ephemerals = { ...rampState.ephemerals, ...ephemerals };
  }

  // TODO how to make these private?
  createRampState(rampId: string, quoteId: string, currentPhase: any, unsignedTxs: UnsignedTx[]): void {
    this.rampStates.set(rampId, {
      currentPhase,
      ephemerals: {},
      quoteId,
      rampId,
      unsignedTxs
    });
  }

  updateRampState(rampId: string, currentPhase: any, unsignedTxs: UnsignedTx[]): void {
    const existingState = this.rampStates.get(rampId);
    if (existingState) {
      existingState.currentPhase = currentPhase;
      existingState.unsignedTxs = unsignedTxs;
    }
  }

  hasRampState(rampId: string): boolean {
    return this.rampStates.has(rampId);
  }

  getRampState(rampId: string): RampState | undefined {
    return this.rampStates.get(rampId);
  }

  removeRampState(rampId: string): void {
    this.rampStates.delete(rampId);
  }

  private async registerRamp(request: RegisterRampRequest): Promise<RegisterRampResponse> {
    const rampProcess = await this.apiService.registerRamp(request);

    this.createRampState(rampProcess.id, rampProcess.quoteId, rampProcess.currentPhase, rampProcess.unsignedTxs);

    return rampProcess;
  }

  private async updateRamp(request: UpdateRampRequest): Promise<UpdateRampResponse> {
    const rampProcess = await this.apiService.updateRamp(request);

    // Update the stored ramp state
    this.updateRampState(rampProcess.id, rampProcess.currentPhase, rampProcess.unsignedTxs);

    return rampProcess;
  }

  private async startRamp(request: StartRampRequest): Promise<StartRampResponse> {
    return this.apiService.startRamp(request);
  }
}
