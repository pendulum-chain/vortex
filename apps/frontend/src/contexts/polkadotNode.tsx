import { ApiPromise, WsProvider } from "@polkadot/api";
import { useQuery } from "@tanstack/react-query";
import { createContext, type JSX, useContext, useEffect } from "react";

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
  assethub?: ApiComponents;
  pendulum?: ApiComponents;
  moonbeam?: ApiComponents;
}

interface PolkadotNodeContextInterface {
  state: NetworkState;
}

const PolkadotNodeContext = createContext<PolkadotNodeContextInterface>({
  state: {}
});

async function createApiComponents(socketUrl: string, autoReconnect = true): Promise<ApiComponents> {
  // Parameters from here https://github.com/galacticcouncil/sdk/blob/master/packages/sdk/TROUBLESHOOTING.md#websocket-ttl-cache
  const provider = new WsProvider(socketUrl, autoReconnect ? 2_500 : undefined, {}, 60_000, 102400, 10 * 60_000);
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
  AssetHub = "assethub",
  Pendulum = "pendulum",
  Moonbeam = "moonbeam"
}

const getSocketUrl = (nodeName: NodeName): string => {
  switch (nodeName) {
    case NodeName.AssetHub:
      return ASSETHUB_WSS;
    case NodeName.Pendulum:
      return PENDULUM_WSS;
    case NodeName.Moonbeam:
      return MOONBEAM_WSS;
  }

  throw new Error(`Unsupported Polkadot node: ${nodeName}`);
};

const usePolkadotNode = (nodeName: NodeName, enabled = false) => {
  const { showToast, ToastMessage } = useToastMessage();
  const { state } = usePolkadotNodes();
  const {
    data: apiComponents = state[nodeName],
    error,
    isFetched
  } = useQuery({
    enabled,
    queryFn: () => createApiComponents(getSocketUrl(nodeName)),
    queryKey: ["polkadot-node", nodeName],
    retry: 3
  });

  useEffect(() => {
    if (!error) {
      return;
    }

    console.error(`Failed to initialize ${nodeName} node:`, error);
    showToast(ToastMessage.NODE_CONNECTION_ERROR);
  }, [error, nodeName, showToast, ToastMessage.NODE_CONNECTION_ERROR]);

  return { apiComponents, error, isFetched: enabled ? isFetched : true };
};

const useAssetHubNode = (enabled = false) => usePolkadotNode(NodeName.AssetHub, enabled);
const usePendulumNode = (enabled = false) => usePolkadotNode(NodeName.Pendulum, enabled);
const useMoonbeamNode = (enabled = false) => usePolkadotNode(NodeName.Moonbeam, enabled);

const PolkadotNodeProvider = ({ children }: { children: JSX.Element }) => {
  return <PolkadotNodeContext.Provider value={{ state: {} }}>{children}</PolkadotNodeContext.Provider>;
};

export { PolkadotNodeProvider, useAssetHubNode, usePendulumNode, useMoonbeamNode };
