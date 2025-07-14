import type { CreateQuoteRequest, EphemeralAccount, QuoteResponse } from "@packages/shared";
import { Networks } from "@packages/shared";
import { ApiPromise, WsProvider } from "@polkadot/api";
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
import {
  APINotInitializedError,
  BrlaKycStatusError,
  EphemeralGenerationError,
  handleAPIResponse,
  RampStateNotFoundError,
  TransactionSigningError
} from "./errors";
import type { BrlaKycResponse, BrlaOnrampAdditionalData, RampState, VortexSignerConfig } from "./types";

interface NetworkConfig {
  name: string;
  wsUrl: string;
}

const NETWORKS: NetworkConfig[] = [
  {
    name: "assethub",
    wsUrl: "wss://asset-hub-polkadot-rpc.dwellir.com"
  },
  {
    name: "pendulum",
    wsUrl: "wss://rpc-pendulum.prd.pendulumchain.tech"
  },
  {
    name: "moonbeam",
    wsUrl: "wss://moonbeam.unitedbloc.com"
  }
];

export class VortexSigner {
  private config: VortexSignerConfig;
  private rampStates: Map<string, RampState> = new Map();
  private initializationPromise: Promise<void>;
  private pendulumApi?: ApiPromise;
  private moonbeamApi?: ApiPromise;

  constructor(config: VortexSignerConfig) {
    this.config = config;
    this.initializationPromise = this.initializeApis();

    console.log("VortexSigner initialized with config:", config);
  }

  private async initializeApis(): Promise<void> {
    const autoReconnect = this.config.autoReconnect ?? true;

    const pendulumWsUrl = this.config.pendulumWsUrl || NETWORKS.find(n => n.name === Networks.Pendulum)?.wsUrl;
    const moonbeamWsUrl = this.config.moonbeamWsUrl || NETWORKS.find(n => n.name === Networks.Moonbeam)?.wsUrl;

    if (!pendulumWsUrl || !moonbeamWsUrl) {
      throw new Error("Pendulum and Moonbeam WebSocket URLs must be provided or configured.");
    }

    const pendulumProvider = new WsProvider(pendulumWsUrl, autoReconnect ? 1000 : false);
    this.pendulumApi = await ApiPromise.create({ provider: pendulumProvider });

    const moonbeamProvider = new WsProvider(moonbeamWsUrl, autoReconnect ? 1000 : false);
    this.moonbeamApi = await ApiPromise.create({ provider: moonbeamProvider });

    await Promise.all([this.pendulumApi.isReady, this.moonbeamApi.isReady]);
  }

  async waitForInitialization(): Promise<void> {
    await this.initializationPromise;
  }

  async createQuote(request: CreateQuoteRequest): Promise<QuoteResponse> {
    const response = await fetch(`${this.config.apiBaseUrl}/v1/quotes`, {
      body: JSON.stringify(request),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    });

    return handleAPIResponse<QuoteResponse>(response, "/v1/quotes");
  }

  // We want to keep these methods (register, update and starte) as private, and use them inside
  // ramp-specific operations (Brla, Stellar, etc.) to ensure type safety.
  private async registerRamp(request: RegisterRampRequest): Promise<RegisterRampResponse> {
    const response = await fetch(`${this.config.apiBaseUrl}/v1/ramp/register`, {
      body: JSON.stringify(request),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    });

    const rampProcess = await handleAPIResponse<RegisterRampResponse>(response, "/v1/ramp/register");

    this.rampStates.set(rampProcess.id, {
      currentPhase: rampProcess.currentPhase,
      ephemerals: {},
      quoteId: rampProcess.quoteId,
      rampId: rampProcess.id,
      unsignedTxs: rampProcess.unsignedTxs
    });

    return rampProcess;
  }

  private async updateRamp(request: UpdateRampRequest): Promise<UpdateRampResponse> {
    const response = await fetch(`${this.config.apiBaseUrl}/v1/ramp/update`, {
      body: JSON.stringify(request),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    });

    const rampProcess = await handleAPIResponse<UpdateRampResponse>(response, "/v1/ramp/update");

    // Update the stored ramp state
    const existingState = this.rampStates.get(rampProcess.id);
    if (existingState) {
      existingState.currentPhase = rampProcess.currentPhase;
      existingState.unsignedTxs = rampProcess.unsignedTxs;
    }

    return rampProcess;
  }

  private async startRamp(request: StartRampRequest): Promise<StartRampResponse> {
    const response = await fetch(`${this.config.apiBaseUrl}/v1/ramp/start`, {
      body: JSON.stringify(request),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    });

    return handleAPIResponse<StartRampResponse>(response, "/v1/ramp/start");
  }

  async getRampStatus(rampId: string): Promise<RampProcess> {
    const response = await fetch(`${this.config.apiBaseUrl}/v1/ramp/status/${rampId}`, {
      headers: {
        "Content-Type": "application/json"
      },
      method: "GET"
    });

    const rampProcess = await handleAPIResponse<RampProcess>(response, `/v1/ramp/status/${rampId}`);

    const existingState = this.rampStates.get(rampProcess.id);
    if (existingState) {
      existingState.currentPhase = rampProcess.currentPhase;
    }

    return rampProcess;
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

  async signTransactions(rampId: string, unsignedTxs: UnsignedTx[]): Promise<any[]> {
    await this.waitForInitialization();

    const rampState = this.rampStates.get(rampId);
    if (!rampState) {
      throw new RampStateNotFoundError(rampId);
    }

    if (!this.pendulumApi) {
      throw new APINotInitializedError("Pendulum");
    }

    if (!this.moonbeamApi) {
      throw new APINotInitializedError("Moonbeam");
    }

    try {
      const signedTxs = await signUnsignedTransactions(
        unsignedTxs,
        rampState.ephemerals,
        this.pendulumApi as any, // TODO fix typing
        this.moonbeamApi as any,
        this.config.alchemyApiKey
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

  getRampState(rampId: string): RampState | undefined {
    return this.rampStates.get(rampId);
  }

  removeRampState(rampId: string): void {
    this.rampStates.delete(rampId);
  }

  private async getBrlaKycStatus(taxId: string): Promise<BrlaKycResponse> {
    if (!taxId) {
      throw new BrlaKycStatusError("Tax ID is required", 400);
    }

    const url = new URL(`${this.config.apiBaseUrl}/v1/brla/getUser`);
    url.searchParams.append("taxId", taxId);

    const response = await fetch(url.toString(), {
      headers: {
        "Content-Type": "application/json"
      },
      method: "GET"
    });

    return handleAPIResponse<BrlaKycResponse>(response, "/v1/brla/getUser");
  }

  async registerBrlaOnramp(quoteId: string, additionalData: BrlaOnrampAdditionalData): Promise<RampProcess> {
    if (!additionalData.taxId) {
      throw new Error("Tax ID is required for BRLA onramp");
    }

    const kycStatus = await this.getBrlaKycStatus(additionalData.taxId);
    if (kycStatus.kycLevel < 1) {
      throw new Error(`Insufficient KYC level. Current: ${kycStatus.kycLevel}`);
    }

    const requiredNetworks = [Networks.Pendulum, Networks.Moonbeam]; // Hardcoded for BRLA onramp.
    const { ephemerals, accountMetas } = await this.generateEphemerals(requiredNetworks);

    const registerRequest: RegisterRampRequest = {
      additionalData: {
        destinationAddress: additionalData.destinationAddress,
        taxId: additionalData.taxId
      },
      quoteId,
      signingAccounts: accountMetas
    };

    const rampProcess = await this.registerRamp(registerRequest);
    const rampId = rampProcess.id;

    this.setEphemerals(rampId, {
      moonbeamEphemeral: ephemerals[Networks.Moonbeam],
      pendulumEphemeral: ephemerals[Networks.Pendulum],
      stellarEphemeral: ephemerals[Networks.Stellar]
    });

    const signedTxs = await this.signTransactions(rampId, rampProcess.unsignedTxs);

    const updateRequest: UpdateRampRequest = {
      additionalData: {},
      presignedTxs: signedTxs,
      rampId
    };

    const updatedRampProcess = await this.updateRamp(updateRequest);

    return updatedRampProcess;
  }

  async startBrlaOnramp(rampId: string): Promise<RampProcess> {
    if (!this.rampStates.has(rampId)) {
      throw new RampStateNotFoundError(rampId);
    }

    const startRequest: StartRampRequest = { rampId };
    return this.startRamp(startRequest);
  }
}
