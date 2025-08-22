import { ApiPromise, WsProvider } from "@polkadot/api";
import { MOONBEAM_WSS } from "../../constants/constants";
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

class MoonbeamApiService {
  private static instance: MoonbeamApiService;
  private apiComponents: Promise<ApiComponents>;

  private constructor() {
    this.apiComponents = createApiComponents(MOONBEAM_WSS);
  }

  public static getInstance(): MoonbeamApiService {
    if (!MoonbeamApiService.instance) {
      MoonbeamApiService.instance = new MoonbeamApiService();
    }
    return MoonbeamApiService.instance;
  }

  public getApi(): Promise<ApiComponents> {
    return this.apiComponents;
  }
}

export const moonbeamApiService = MoonbeamApiService.getInstance();
