import { ApiPromise, WsProvider } from "@polkadot/api";
import { Networks } from "@vortexfi/shared";
import type { NetworkConfig, VortexSdkConfig } from "../types";

const DEFAULT_NETWORKS: NetworkConfig[] = [
  {
    name: "assethub",
    wsUrl: "wss://dot-rpc.stakeworld.io/assethub"
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
    wsUrl: "wss://hydration.dotters.network"
  }
];

export class NetworkManager {
  private pendulumApi?: ApiPromise;
  private moonbeamApi?: ApiPromise;
  private hydrationApi?: ApiPromise;
  private pendulumApiPromise?: Promise<ApiPromise>;
  private moonbeamApiPromise?: Promise<ApiPromise>;
  private hydrationApiPromise?: Promise<ApiPromise>;

  constructor(private readonly config: VortexSdkConfig) {}

  async waitForInitialization(): Promise<void> {
    return;
  }

  async getPendulumApi(): Promise<ApiPromise> {
    if (this.pendulumApi) {
      return this.pendulumApi;
    }

    if (!this.pendulumApiPromise) {
      this.pendulumApiPromise = this.initializeApi(Networks.Pendulum)
        .then(api => {
          this.pendulumApi = api;
          return api;
        })
        .catch(error => {
          this.pendulumApiPromise = undefined;
          throw error;
        });
    }

    return this.pendulumApiPromise;
  }

  async getMoonbeamApi(): Promise<ApiPromise> {
    if (this.moonbeamApi) {
      return this.moonbeamApi;
    }

    if (!this.moonbeamApiPromise) {
      this.moonbeamApiPromise = this.initializeApi(Networks.Moonbeam)
        .then(api => {
          this.moonbeamApi = api;
          return api;
        })
        .catch(error => {
          this.moonbeamApiPromise = undefined;
          throw error;
        });
    }

    return this.moonbeamApiPromise;
  }

  async getHydrationApi(): Promise<ApiPromise> {
    if (this.hydrationApi) {
      return this.hydrationApi;
    }

    if (!this.hydrationApiPromise) {
      this.hydrationApiPromise = this.initializeApi(Networks.Hydration)
        .then(api => {
          this.hydrationApi = api;
          return api;
        })
        .catch(error => {
          this.hydrationApiPromise = undefined;
          throw error;
        });
    }

    return this.hydrationApiPromise;
  }

  getAlchemyApiKey(): string | undefined {
    return "9nk8Nf7Eaz_4smCzIcPUk";
  }

  private async initializeApi(network: Networks.Pendulum | Networks.Moonbeam | Networks.Hydration): Promise<ApiPromise> {
    const wsUrl = this.getWsUrl(network);
    if (!wsUrl) {
      throw new Error(`${network} WebSocket URL must be provided or configured.`);
    }

    const provider = new WsProvider(wsUrl, 2_500, {}, 60_000, 102400, 10 * 60_000);
    const api = await ApiPromise.create({ provider });
    await api.isReady;
    return api;
  }

  private getWsUrl(network: Networks.Pendulum | Networks.Moonbeam | Networks.Hydration): string | undefined {
    if (network === Networks.Pendulum)
      return this.config.pendulumWsUrl || DEFAULT_NETWORKS.find(n => n.name === network)?.wsUrl;
    if (network === Networks.Moonbeam)
      return this.config.moonbeamWsUrl || DEFAULT_NETWORKS.find(n => n.name === network)?.wsUrl;
    return this.config.hydrationWsUrl || DEFAULT_NETWORKS.find(n => n.name === network)?.wsUrl;
  }
}
