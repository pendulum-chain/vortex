import { options } from '@pendulum-chain/api';
import { rpc } from '@pendulum-chain/types';
import { ApiPromise, WsProvider } from '@polkadot/api';
import { createContext } from 'preact';
import { useContext, useEffect, useState } from 'preact/hooks';
import { toast } from 'react-toastify';

export interface NodeInfoProviderInterface {
  bestNumberFinalize?: number;
  chain?: string;
  nodeName?: string;
  nodeVersion?: string;
  ss58Format?: number;
  tokenDecimals?: number;
  tokenSymbol?: string;
  api?: ApiPromise;
}

const NodeInfoContext = createContext({
  state: {} as Partial<NodeInfoProviderInterface>,
  setState: {} as Dispatch<SetStateAction<Partial<NodeInfoProviderInterface>>>,
});

const NodeInfoProvider = ({
  children,
  tenantRPC,
  value = {},
}: {
  children: ReactNode;
  tenantRPC?: string;
  value?: Partial<NodeInfoProviderInterface>;
}) => {
  const [state, setState] = useState(value);
  const [currentTenantRPC, setCurrentTenantRPC] = useState<string | undefined>(undefined);
  const [pendingInitiationPromise, setPendingInitiationPromise] = useState<Promise<unknown> | undefined>(undefined);

  useEffect(() => {
    let disconnect: () => void = () => undefined;

    // If the tenantRPC is the same as the currentTenantRPC, we don't need to do anything.
    if (!tenantRPC || (currentTenantRPC && currentTenantRPC === tenantRPC)) {
      return disconnect;
    }

    const connect = async () => {
      console.log('connecting to', tenantRPC);

      const provider = new WsProvider(tenantRPC, false);
      await provider.connect();
      const api = await ApiPromise.create(
        options({
          provider,
          rpc,
          // These are necessary so that the promise throws the error
          throwOnConnect: true,
          throwOnUnknown: true,
        }),
      );

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
        // TODO: same as for the api we could create a common interface for fetching data from indexer (swap assets, pools, other info)
        // and pass the instance based on tenant to this context to be used in Swap, Pools components...
        api,
      }));

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

      disconnect = () => {
        api.disconnect();
      };
    };

    console.log('pendingInitiationPromise', pendingInitiationPromise);
    if (!pendingInitiationPromise) {
      // We need this promise based approach to prevent race conditions when the user switches between tenants very quickly.
      // Otherwise, it might happen that the connection to the first endpoint takes longer and resolves later than
      // the connection to the second endpoint which would make us end up with a connection to the outdated endpoint.
      const promise = connect().catch((error) => {
        console.error('Error while connecting to the node:', error);
        toast('Error while connecting to the node. Refresh the page to re-connect.', { type: toast.TYPE.ERROR });
      });
      setPendingInitiationPromise(promise);
    } else {
      pendingInitiationPromise.then(() => {
        setCurrentTenantRPC(tenantRPC);
      });
      return disconnect;
    }
  }, [currentTenantRPC, tenantRPC, pendingInitiationPromise, setPendingInitiationPromise]);

  return <NodeInfoContext.Provider value={{ state, setState }}>{children}</NodeInfoContext.Provider>;
};

const useNodeInfoState = () => useContext(NodeInfoContext);

export { NodeInfoProvider, useNodeInfoState };
