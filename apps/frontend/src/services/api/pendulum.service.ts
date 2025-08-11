import { ApiPromise, WsProvider } from "@polkadot/api";
import { PENDULUM_WSS } from "../../constants/constants";
import { ApiComponents } from "./polkadot.service";

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

class PendulumApiService {
  private static instance: PendulumApiService;
  private apiComponents: Promise<ApiComponents>;

  private constructor() {
    this.apiComponents = createApiComponents(PENDULUM_WSS);
  }

  public static getInstance(): PendulumApiService {
    if (!PendulumApiService.instance) {
      PendulumApiService.instance = new PendulumApiService();
    }
    return PendulumApiService.instance;
  }

  public getApi(): Promise<ApiComponents> {
    return this.apiComponents;
  }
}

export const pendulumApiService = PendulumApiService.getInstance();
