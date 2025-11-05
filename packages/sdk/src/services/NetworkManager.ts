import { ApiPromise, WsProvider } from "@polkadot/api";
import { Networks } from "@vortexfi/shared";
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
    wsUrl: "wss://wss.api.moonbeam.network"
  },
  {
    name: "hydration",
    wsUrl: "wss://rpc.hydradx.cloud"
  }
];

export class NetworkManager {
  private pendulumApi?: ApiPromise;
  private moonbeamApi?: ApiPromise;
  private hydrationApi?: ApiPromise;
  private initializationPromise: Promise<void>;

  constructor(private readonly config: VortexSdkConfig) {
    this.initializationPromise = this.initializeApis();
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

  getHydrationApi(): ApiPromise {
    if (!this.hydrationApi) {
      throw new APINotInitializedError("Moonbeam");
    }

    return this.hydrationApi;
  }

  getAlchemyApiKey(): string | undefined {
    return this.config.alchemyApiKey;
  }

  private async initializeApis(): Promise<void> {
    const _autoReconnect = this.config.autoReconnect ?? true;

    const pendulumWsUrl = this.config.pendulumWsUrl || DEFAULT_NETWORKS.find(n => n.name === Networks.Pendulum)?.wsUrl;
    const moonbeamWsUrl = this.config.moonbeamWsUrl || DEFAULT_NETWORKS.find(n => n.name === Networks.Moonbeam)?.wsUrl;
    const hydrationWsUrl = this.config.hydrationWsUrl || DEFAULT_NETWORKS.find(n => n.name === Networks.Hydration)?.wsUrl;

    if (!pendulumWsUrl || !moonbeamWsUrl || !hydrationWsUrl) {
      throw new Error("Pendulum, Moonbeam and Hydration WebSocket URLs must be provided or configured.");
    }

    const pendulumProvider = new WsProvider(pendulumWsUrl, 2_500, {}, 60_000, 102400, 10 * 60_000);
    this.pendulumApi = await ApiPromise.create({ provider: pendulumProvider });

    const moonbeamProvider = new WsProvider(moonbeamWsUrl, 2_500, {}, 60_000, 102400, 10 * 60_000);
    this.moonbeamApi = await ApiPromise.create({ provider: moonbeamProvider });

    const hydrationProvider = new WsProvider(hydrationWsUrl, 2_500, {}, 60_000, 102400, 10 * 60_000);
    this.hydrationApi = await ApiPromise.create({ provider: hydrationProvider });

    await Promise.all([this.pendulumApi.isReady, this.moonbeamApi.isReady, this.hydrationApi.isReady]);
  }
}
