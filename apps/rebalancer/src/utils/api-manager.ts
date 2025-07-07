import { ApiPromise, WsProvider } from "@polkadot/api";

const API_ENDPOINTS = {
  moonbeam: "wss://wss.api.moonbeam.network",
  pendulum: "wss://rpc-pendulum.prd.pendulumchain.tech:443"
};

const API_DECIMALS = {
  moonbeam: 18,
  pendulum: 12
};

class ApiManager {
  private static instances: { [key: string]: ApiPromise } = {};

  public static async getApi(network: keyof typeof API_ENDPOINTS): Promise<ApiPromise> {
    if (!ApiManager.instances[network]) {
      const provider = new WsProvider(API_ENDPOINTS[network]);
      const api = await ApiPromise.create({ provider });
      await api.isReady;
      ApiManager.instances[network] = api;
      console.log(`${network} API is ready.`);
    }
    return ApiManager.instances[network];
  }

  public static getDecimals(network: keyof typeof API_ENDPOINTS): number {
    return API_DECIMALS[network];
  }
}

export default ApiManager;
