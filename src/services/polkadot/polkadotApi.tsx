import { ApiPromise, WsProvider } from '@polkadot/api';
import { PENDULUM_WSS } from '../../constants/constants';
const NETWORK = 'Pendulum';

export interface ApiComponents {
  api: ApiPromise;
  mutex: Mutex;
  ss58Format: number;
  decimals: number;
}

class ApiManager {
  apiData: ApiComponents | undefined = undefined;

  async connectApi(socketUrl: string) {
    const wsProvider = new WsProvider(socketUrl);
    const api = await ApiPromise.create({
      provider: wsProvider,
      noInitWarn: true,
    });
    const mutex = new Mutex();

    const chainProperties = api.registry.getChainProperties();
    const ss58Format = Number(chainProperties?.get('ss58Format')?.toString() ?? 42);
    const decimals = Number(chainProperties?.get('tokenDecimals')?.toHuman()[0]) ?? 12;

    return { api, mutex, ss58Format, decimals };
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

class Mutex {
  locks = new Map();

  async lock(accountId: string) {
    let resolveLock: (value: unknown) => void;

    const lockPromise = new Promise((resolve) => {
      resolveLock = resolve;
    });

    const prevLock = this.locks.get(accountId) || Promise.resolve();
    this.locks.set(
      accountId,
      prevLock.then(() => lockPromise),
    );

    await prevLock;

    return () => {
      resolveLock(undefined);
    };
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
