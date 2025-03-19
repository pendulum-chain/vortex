import { ApiPromise, WsProvider } from '@polkadot/api';
import { createContext, useContext, JSX } from 'react';
import { useQuery } from '@tanstack/react-query';

import { ASSETHUB_WSS, PENDULUM_WSS } from '../constants/constants';
import { useToastMessage } from '../hooks/useToastMessage';

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
  error: Error | null;
}

const PolkadotNodeContext = createContext<PolkadotNodeContextInterface>({
  state: {},
  isFetched: false,
  error: null,
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

enum NodeName {
  AssetHub = 'assetHub',
  Pendulum = 'pendulum',
}

const usePolkadotNode = (nodeName: NodeName) => {
  const { showToast, ToastMessage } = useToastMessage();
  const { state, isFetched, error } = usePolkadotNodes();

  if (error) {
    console.error(`Failed to initialize ${nodeName} node:`, error);
    showToast(ToastMessage.NODE_CONNECTION_ERROR);
  }

  return { apiComponents: state[nodeName], isFetched, error };
};

const useAssetHubNode = () => usePolkadotNode(NodeName.AssetHub);
const usePendulumNode = () => usePolkadotNode(NodeName.Pendulum);

const initializeNetworks = async (): Promise<NetworkState> => {
  try {
    const [assetHub, pendulum] = await Promise.all([
      createApiComponents(ASSETHUB_WSS),
      createApiComponents(PENDULUM_WSS),
    ]);

    return {
      [NodeName.AssetHub]: assetHub,
      [NodeName.Pendulum]: pendulum,
    };
  } catch (error) {
    console.error('Error initializing networks:', error);
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

  return <PolkadotNodeContext.Provider value={{ state, isFetched, error }}>{children}</PolkadotNodeContext.Provider>;
};

export { PolkadotNodeProvider, useAssetHubNode, usePendulumNode };
