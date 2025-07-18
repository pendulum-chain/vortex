import { Networks } from "@packages/shared";
import { ApiPromise, WsProvider } from "@polkadot/api";
import { APINotInitializedError } from "../errors";
import type { NetworkConfig, VortexSdkConfig } from "../types";

const DEFAULT_NETWORKS: NetworkConfig[] = [
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

export class NetworkManager {
  private pendulumApi?: ApiPromise;
  private moonbeamApi?: ApiPromise;
  private initializationPromise: Promise<void>;

  constructor(private readonly config: VortexSdkConfig) {
    this.initializationPromise = this.initializeApis();
  }

  private async initializeApis(): Promise<void> {
    const autoReconnect = this.config.autoReconnect ?? true;

    const pendulumWsUrl = this.config.pendulumWsUrl || DEFAULT_NETWORKS.find(n => n.name === Networks.Pendulum)?.wsUrl;
    const moonbeamWsUrl = this.config.moonbeamWsUrl || DEFAULT_NETWORKS.find(n => n.name === Networks.Moonbeam)?.wsUrl;

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

  getPendulumApi(): ApiPromise {
    if (!this.pendulumApi) {
      throw new APINotInitializedError("Pendulum");
    }
    return this.pendulumApi;
  }

  getMoonbeamApi(): ApiPromise {
    if (!this.moonbeamApi) {
      throw new APINotInitializedError("Moonbeam");
    }
    return this.moonbeamApi;
  }

  getAlchemyApiKey(): string | undefined {
    return this.config.alchemyApiKey;
  }
}
