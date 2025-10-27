import { ApiPromise, WsProvider } from "@polkadot/api";
import { config } from "../../config";
import { ASSETHUB_WSS, MOONBEAM_WSS, PASEO_WSS, PENDULUM_WSS } from "../../constants/constants";
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

async function createApiComponents(socketUrl: string, autoReconnect = true): Promise<ApiComponents> {
  // Parameters from here https://github.com/galacticcouncil/sdk/blob/master/packages/sdk/TROUBLESHOOTING.md#websocket-ttl-cache
  const provider = new WsProvider(socketUrl, autoReconnect ? 2_500 : false, {}, 60_000, 102400, 10 * 60_000);
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

enum NodeName {
  AssetHub = "assethub",
  Pendulum = "pendulum",
  Moonbeam = "moonbeam",
  Paseo = "paseo"
}

const nodeUrls = {
  [NodeName.AssetHub]: ASSETHUB_WSS,
  [NodeName.Pendulum]: PENDULUM_WSS,
  [NodeName.Moonbeam]: MOONBEAM_WSS,
  [NodeName.Paseo]: PASEO_WSS
};

class PolkadotApiService {
  private static instance: PolkadotApiService;
  private apiComponents: Map<NodeName, Promise<ApiComponents>> = new Map();

  private constructor() {}

  public static getInstance(): PolkadotApiService {
    if (!PolkadotApiService.instance) {
      PolkadotApiService.instance = new PolkadotApiService();
    }
    return PolkadotApiService.instance;
  }

  public getApi(nodeName: NodeName): Promise<ApiComponents> {
    if (!config.isSandbox && nodeName === NodeName.Paseo) {
      throw new Error("Paseo only available in sandbox mode");
    }
    if (!this.apiComponents.has(nodeName)) {
      const promise = createApiComponents(nodeUrls[nodeName]);
      this.apiComponents.set(nodeName, promise);
    }
    return this.apiComponents.get(nodeName)!;
  }
}

export const polkadotApiService = PolkadotApiService.getInstance();
export { NodeName as PolkadotNodeName };
