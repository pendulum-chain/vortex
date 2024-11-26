import { ApiPromise, WsProvider } from '@polkadot/api';
import { createContext, StateUpdater, useContext, useEffect, useState } from 'preact/compat';
import { ToastMessage } from '../helpers/notifications';
import { showToast } from '../helpers/notifications';
import { ASSETHUB_WSS } from '../constants/constants';

async function createApiPromise(provider: WsProvider) {
  return ApiPromise.create({
    provider,
    throwOnConnect: true,
    throwOnUnknown: true,
  });
}

export interface PolkadotNodeProviderInterface {
  bestNumberFinalize?: number;
  chain?: string;
  nodeName?: string;
  nodeVersion?: string;
  ss58Format?: number;
  tokenDecimals?: number;
  tokenSymbol?: string;
  api?: ApiPromise;
}

interface PolkadotNodeContextInterface {
  state: Partial<PolkadotNodeProviderInterface>;
  setState: StateUpdater<Partial<PolkadotNodeProviderInterface>>;
}

const PolkadotNodeContext = createContext<PolkadotNodeContextInterface>({
  state: {} as Partial<PolkadotNodeProviderInterface>,
  setState: {} as StateUpdater<Partial<PolkadotNodeProviderInterface>>,
});

const usePolkadotNode = () => {
  const context = useContext(PolkadotNodeContext);
  if (!context) {
    throw new Error('usePolkadotNode must be used within a PolkadotNodeProvider');
  }
  return context.state;
};

const PolkadotNodeProvider = ({ children, rpc = ASSETHUB_WSS }: { children: JSX.Element; rpc?: string }) => {
  const [state, setState] = useState({} as Partial<PolkadotNodeProviderInterface>);
  const [currentRPC, setCurrentRPC] = useState<string | undefined>(undefined);
  const [pendingInitiationPromise, setPendingInitiationPromise] = useState<Promise<unknown> | undefined>(undefined);

  async function updateStateWithChainProperties(api: ApiPromise) {
    const bestNumberFinalize = await api.derive.chain.bestNumber();
    const chainProperties = await api.registry.getChainProperties();
    const ss58Format = chainProperties?.get('ss58Format').toString();
    const tokenDecimals = Number(
      chainProperties
        ?.get('tokenDecimals')
        .toString()
        .replace(/[\\[\]]/g, ''),
    );
    const tokenSymbol = chainProperties
      ?.get('tokenSymbol')
      .toString()
      .replace(/[\\[\]]/g, '');

    setState((prevState) => ({
      ...prevState,
      bestNumberFinalize: Number(bestNumberFinalize),
      ss58Format: Number(ss58Format),
      tokenDecimals,
      tokenSymbol,
      api,
    }));
  }

  async function updateStateWithSystemInfo(api: ApiPromise) {
    const [chain, nodeName, nodeVersion] = await Promise.all([
      api.rpc.system.chain(),
      api.rpc.system.name(),
      api.rpc.system.version(),
    ]);

    setState((prevState) => ({
      ...prevState,
      chain: chain.toString(),
      nodeName: nodeName.toString(),
      nodeVersion: nodeVersion.toString(),
    }));
  }

  async function handleConnectionError(error: Error) {
    console.error('Error while connecting to the node:', error);
    showToast(ToastMessage.NODE_CONNECTION_ERROR);
  }

  useEffect(() => {
    let disconnect: () => void = () => undefined;

    if (!rpc || (currentRPC && currentRPC === rpc)) {
      return disconnect;
    }

    const connect = async () => {
      const provider = new WsProvider(rpc, false);
      await provider.connect();

      const api = await createApiPromise(provider);
      await updateStateWithChainProperties(api);
      await updateStateWithSystemInfo(api);

      disconnect = () => {
        api.disconnect();
      };
    };

    if (!pendingInitiationPromise) {
      const promise = connect().catch(handleConnectionError);
      setPendingInitiationPromise(promise);
    } else {
      pendingInitiationPromise.then(() => {
        setCurrentRPC(rpc);
      });
      return disconnect;
    }
  }, [currentRPC, pendingInitiationPromise, rpc]);

  return <PolkadotNodeContext.Provider value={{ state, setState }}>{children}</PolkadotNodeContext.Provider>;
};

export { PolkadotNodeProvider, usePolkadotNode };
