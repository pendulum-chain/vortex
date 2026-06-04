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
    wsUrl: "wss://hydration.ibp.network"
  }
];

export class NetworkManager {
  private pendulumApi?: ApiPromise;
  private moonbeamApi?: ApiPromise;
  private hydrationApi?: ApiPromise;

  constructor(private readonly config: VortexSdkConfig) {}

  async waitForInitialization(): Promise<void> {
    return;
  }

  async getPendulumApi(): Promise<ApiPromise> {
    if (!this.pendulumApi) {
      this.pendulumApi = await this.initializeApi(Networks.Pendulum);
    }
    return this.pendulumApi;
  }

  async getMoonbeamApi(): Promise<ApiPromise> {
    if (!this.moonbeamApi) {
      this.moonbeamApi = await this.initializeApi(Networks.Moonbeam);
    }
    return this.moonbeamApi;
  }

  async getHydrationApi(): Promise<ApiPromise> {
    if (!this.hydrationApi) {
      this.hydrationApi = await this.initializeApi(Networks.Hydration);
    }

    return this.hydrationApi;
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
