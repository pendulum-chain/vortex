import { ApiPromise, WsProvider } from '@polkadot/api';
import { PENDULUM_WSS } from '../../../constants/constants';
import { ApiOptions } from '@polkadot/api/types';
import { rpc } from '@pendulum-chain/types';

export async function createPolkadotApi(): Promise<{
  api: ApiPromise;
  decimals: number;
  ss58Format: number;
}> {
  const getSpecVersion = async (apiInstance: ApiPromise): Promise<number> => {
    const runtimeVersion = await apiInstance.call.core.version();
    const human = runtimeVersion.toHuman() as { specVersion: number };
    return human.specVersion;
  };

  const initiateApi = async (): Promise<{ api: ApiPromise; previousSpecVersion: number }> => {
    const wsProvider = new WsProvider(PENDULUM_WSS);
    const options: ApiOptions = {
      provider: wsProvider,
      rpc,
    };
    const api = await ApiPromise.create(options);
    await api.isReady;

    const previousSpecVersion = await getSpecVersion(api);

    return { api, previousSpecVersion };
  };

  const { api, previousSpecVersion } = await initiateApi();

  if (!api.isConnected) await api.connect();
  await api.isReady;

  const currentSpecVersion = await getSpecVersion(api);
  if (currentSpecVersion !== previousSpecVersion) {
    await initiateApi();
  }

  const chainProperties = api.registry.getChainProperties();
  const ss58Format = Number(chainProperties?.get('ss58Format')?.toString() ?? 42);
  const decimals = Number(chainProperties?.get('tokenDecimals')?.toHuman()[0]) ?? 12;

  return { api, decimals, ss58Format };
}
