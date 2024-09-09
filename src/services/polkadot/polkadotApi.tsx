import { ApiPromise, WsProvider } from '@polkadot/api';
import { PENDULUM_WSS } from '../../constants/constants';

const NETWORK = 'Pendulum';
const AUTO_RECONNECT_DELAY_MS = 1000;

export interface ApiComponents {
  api: ApiPromise;
  ss58Format: number;
  decimals: number;
}

class ApiManager {
  apiData: ApiComponents | undefined = undefined;

  async connectApi(socketUrl: string) {
    const wsProvider = new WsProvider(socketUrl, AUTO_RECONNECT_DELAY_MS);
    const api = await ApiPromise.create({
      provider: wsProvider,
      noInitWarn: true,
    });

    const chainProperties = api.registry.getChainProperties();
    const ss58Format = Number(chainProperties?.get('ss58Format')?.toString() ?? 42);
    const decimals = Number(chainProperties?.get('tokenDecimals')?.toHuman()[0]) ?? 12;

    return { api, ss58Format, decimals };
  }

  async populateApi() {
    const network = { name: NETWORK, wss: PENDULUM_WSS };

    console.log(`Connecting to node ${network.wss}...`);
    this.apiData = await this.connectApi(network.wss);
    await this.apiData.api.isReady;
    console.log(`Connected to node ${network.wss}`);
  }

  async getApiComponents(): Promise<ApiComponents> {
    if (!this.apiData) {
      await this.populateApi();
    }
    // will always be populated
    return this.apiData!;
  }
}

let instance: ApiManager | undefined = undefined;

export async function getApiManagerInstance(): Promise<ApiManager> {
  if (!instance) {
    const instancePreparing = new ApiManager();
    await instancePreparing.populateApi();
    instance = instancePreparing;
  }
  return instance;
}

export { ApiManager, ApiPromise };
