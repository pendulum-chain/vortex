import { ApiPromise, WsProvider } from "@polkadot/api";
import { useQuery } from "@tanstack/react-query";
import { createContext, JSX, useContext } from "react";

import { ASSETHUB_WSS, MOONBEAM_WSS, PENDULUM_WSS } from "../constants/constants";
import { useToastMessage } from "../helpers/notifications";

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
  moonbeam?: ApiComponents;
}

interface PolkadotNodeContextInterface {
  state: NetworkState;
  isFetched: boolean;
  error: Error | null;
}

const PolkadotNodeContext = createContext<PolkadotNodeContextInterface>({
  error: null,
  isFetched: false,
  state: {}
});

async function createApiComponents(socketUrl: string, autoReconnect = true): Promise<ApiComponents> {
  const provider = new WsProvider(socketUrl, autoReconnect ? 1000 : false);
  const api = await ApiPromise.create({ provider });

  await api.isReady;

  const chainProperties = api.registry.getChainProperties();
  const ss58Format = Number(chainProperties?.get("ss58Format")?.toString() ?? 42);
  const decimals = Number(chainProperties?.get("tokenDecimals")?.toHuman()[0]) ?? 12;

  const [chain, nodeName, nodeVersion, bestNumberFinalize] = await Promise.all([
    api.rpc.system.chain(),
    api.rpc.system.name(),
    api.rpc.system.version(),
    api.derive.chain.bestNumber()
  ]);

  return {
    api,
    bestNumberFinalize: Number(bestNumberFinalize),
    chain: chain.toString(),
    decimals,
    nodeName: nodeName.toString(),
    nodeVersion: nodeVersion.toString(),
    ss58Format,
    tokenSymbol: chainProperties
      ?.get("tokenSymbol")
      ?.toString()
      ?.replace(/[\\[\]]/g, "")
  };
}

const usePolkadotNodes = () => {
  const context = useContext(PolkadotNodeContext);
  if (!context) {
    throw new Error("usePolkadotNode must be used within a PolkadotNodeProvider");
  }
  return context;
};

enum NodeName {
  AssetHub = "assetHub",
  Pendulum = "pendulum",
  Moonbeam = "moonbeam"
}

const usePolkadotNode = (nodeName: NodeName) => {
  const { showToast, ToastMessage } = useToastMessage();
  const { state, isFetched, error } = usePolkadotNodes();

  if (error) {
    console.error(`Failed to initialize ${nodeName} node:`, error);
    showToast(ToastMessage.NODE_CONNECTION_ERROR);
  }

  return { apiComponents: state[nodeName], error, isFetched };
};

const useAssetHubNode = () => usePolkadotNode(NodeName.AssetHub);
const usePendulumNode = () => usePolkadotNode(NodeName.Pendulum);
const useMoonbeamNode = () => {
  const { state, isFetched } = usePolkadotNodes();
  return { apiComponents: state.moonbeam, isFetched };
};

const initializeNetworks = async (): Promise<NetworkState> => {
  try {
    const [assetHub, pendulum, moonbeam] = await Promise.all([
      createApiComponents(ASSETHUB_WSS),
      createApiComponents(PENDULUM_WSS),
      createApiComponents(MOONBEAM_WSS)
    ]);

    return {
      [NodeName.AssetHub]: assetHub,
      [NodeName.Pendulum]: pendulum,
      moonbeam
    };
  } catch (error) {
    console.error("Error initializing networks:", error);
    throw error;
  }
};

const PolkadotNodeProvider = ({ children }: { children: JSX.Element }) => {
  const {
    data: state = {},
    error,
    isFetched
  } = useQuery({
    queryFn: initializeNetworks,
    queryKey: ["polkadot-nodes"],
    retry: 3
  });

  if (error) {
    console.error("Failed to initialize Polkadot nodes:", error);
  }

  return <PolkadotNodeContext.Provider value={{ error, isFetched, state }}>{children}</PolkadotNodeContext.Provider>;
};

export { PolkadotNodeProvider, useAssetHubNode, usePendulumNode, useMoonbeamNode };
