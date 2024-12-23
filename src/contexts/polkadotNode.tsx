import { ApiPromise, WsProvider } from '@polkadot/api';
import { createContext, useContext } from 'preact/compat';
import { useQuery } from '@tanstack/react-query';
import { ToastMessage } from '../helpers/notifications';
import { showToast } from '../helpers/notifications';
import { ASSETHUB_WSS, PENDULUM_WSS } from '../constants/constants';

export interface ApiComponents {
  api: ApiPromise;
  ss58Format: number;
  decimals: number;
  chain?: string;
  nodeName?: string;
  nodeVersion?: string;
  bestNumberFinalize?: number;
  tokenSymbol?: string;
}

interface NetworkState {
  assetHub?: ApiComponents;
  pendulum?: ApiComponents;
}

interface PolkadotNodeContextInterface {
  state: NetworkState;
  isFetched: boolean;
}

const PolkadotNodeContext = createContext<PolkadotNodeContextInterface>({
  state: {},
  isFetched: false,
});

async function createApiComponents(socketUrl: string, autoReconnect = true): Promise<ApiComponents> {
  const provider = new WsProvider(socketUrl, autoReconnect ? 1000 : false);
  const api = await ApiPromise.create({ provider });

  await api.isReady;

  const chainProperties = api.registry.getChainProperties();
  const ss58Format = Number(chainProperties?.get('ss58Format')?.toString() ?? 42);
  const decimals = Number(chainProperties?.get('tokenDecimals')?.toHuman()[0]) ?? 12;

  const [chain, nodeName, nodeVersion, bestNumberFinalize] = await Promise.all([
    api.rpc.system.chain(),
    api.rpc.system.name(),
    api.rpc.system.version(),
    api.derive.chain.bestNumber(),
  ]);

  return {
    api,
    ss58Format,
    decimals,
    chain: chain.toString(),
    nodeName: nodeName.toString(),
    nodeVersion: nodeVersion.toString(),
    bestNumberFinalize: Number(bestNumberFinalize),
    tokenSymbol: chainProperties
      ?.get('tokenSymbol')
      ?.toString()
      ?.replace(/[\\[\]]/g, ''),
  };
}

const usePolkadotNodes = () => {
  const context = useContext(PolkadotNodeContext);
  if (!context) {
    throw new Error('usePolkadotNode must be used within a PolkadotNodeProvider');
  }
  return context;
};

const useAssetHubNode = () => {
  const { state, isFetched } = usePolkadotNodes();
  return { apiComponents: state.assetHub, isFetched };
};

const usePendulumNode = () => {
  const { state, isFetched } = usePolkadotNodes();
  return { apiComponents: state.pendulum, isFetched };
};

const initializeNetworks = async (): Promise<NetworkState> => {
  try {
    const [assetHub, pendulum] = await Promise.all([
      createApiComponents(ASSETHUB_WSS),
      createApiComponents(PENDULUM_WSS),
    ]);

    return {
      assetHub,
      pendulum,
    };
  } catch (error) {
    console.error('Error initializing networks:', error);
    showToast(ToastMessage.NODE_CONNECTION_ERROR);
    throw error;
  }
};

const PolkadotNodeProvider = ({ children }: { children: JSX.Element }) => {
  const {
    data: state = {},
    error,
    isFetched,
  } = useQuery({
    queryKey: ['polkadot-nodes'],
    queryFn: initializeNetworks,
    retry: 3,
  });

  if (error) {
    console.error('Failed to initialize Polkadot nodes:', error);
  }

  return <PolkadotNodeContext.Provider value={{ state, isFetched }}>{children}</PolkadotNodeContext.Provider>;
};

export { PolkadotNodeProvider, usePolkadotNodes, useAssetHubNode, usePendulumNode };
