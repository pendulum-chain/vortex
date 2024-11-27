import { ApiPromise, WsProvider } from '@polkadot/api';
import { createContext, StateUpdater, useContext, useEffect, useState } from 'preact/compat';
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
  setState: StateUpdater<NetworkState>;
}

const PolkadotNodeContext = createContext<PolkadotNodeContextInterface>({
  state: {},
  setState: {} as StateUpdater<NetworkState>,
});

async function createApiComponents(socketUrl: string, autoReconnect = true): Promise<ApiComponents> {
  const wsProvider = new WsProvider(socketUrl, autoReconnect ? 1000 : false);
  const api = await ApiPromise.create({
    provider: wsProvider,
    noInitWarn: true,
  });

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
  return context.state;
};

const useAssetHubNode = () => {
  const state = usePolkadotNodes();
  return state.assetHub;
};

const usePendulumNode = () => {
  const state = usePolkadotNodes();
  return state.pendulum;
};

const PolkadotNodeProvider = ({ children }: { children: JSX.Element }) => {
  const [state, setState] = useState<NetworkState>({});

  useEffect(() => {
    const initializeNetworks = async () => {
      try {
        const [assetHub, pendulum] = await Promise.all([
          createApiComponents(ASSETHUB_WSS),
          createApiComponents(PENDULUM_WSS),
        ]);

        setState({
          assetHub,
          pendulum,
        });
      } catch (error) {
        console.error('Error initializing networks:', error);
        showToast(ToastMessage.NODE_CONNECTION_ERROR);
      }
    };

    initializeNetworks();

    return () => {
      state.assetHub?.api.disconnect();
      state.pendulum?.api.disconnect();
    };
  }, [state.assetHub?.api, state.pendulum?.api]);

  return <PolkadotNodeContext.Provider value={{ state, setState }}>{children}</PolkadotNodeContext.Provider>;
};

export { PolkadotNodeProvider, usePolkadotNodes, useAssetHubNode, usePendulumNode };
