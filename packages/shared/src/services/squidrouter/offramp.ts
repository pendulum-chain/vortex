import { EvmNetworks, EvmTransactionData, isNetworkEVM, Networks } from "../../index";
import { EvmClientManager } from "../evm/clientManager";
import { getRoute } from "./route";
import { createGenericRouteParams } from "./route-params";
import { createTransactionDataFromRoute } from "./route-transactions";

export interface OfframpSquidrouterParamsToEvm {
  fromAddress: string;
  rawAmount: string;
  fromToken: `0x${string}`;
  toToken: `0x${string}`;
  fromNetwork: Networks;
  toNetwork: Networks;
  destinationAddress: string;
}

export interface OfframpTransactionDataToEvm {
  approveData: EvmTransactionData;
  swapData: EvmTransactionData;
  squidRouterQuoteId?: string;
}

export async function createOfframpSquidrouterTransactionsToEvm(
  params: OfframpSquidrouterParamsToEvm
): Promise<OfframpTransactionDataToEvm> {
  if (params.fromNetwork === Networks.AssetHub) {
    throw new Error("AssetHub is not supported for Squidrouter offramp");
  }
  if (!isNetworkEVM(params.fromNetwork)) {
    throw new Error(`createOfframpSquidrouterTransactionsToEvm: fromNetwork ${params.fromNetwork} is not an EVM network`);
  }

  const evmClientManager = EvmClientManager.getInstance();
  const fromNetworkClient = evmClientManager.getClient(params.fromNetwork as EvmNetworks);

  const routeParams = createGenericRouteParams({ amount: params.rawAmount, ...params });

  const routeResult = await getRoute(routeParams);
  const { route } = routeResult.data;

  return createTransactionDataFromRoute({
    inputTokenErc20Address: params.fromToken,
    publicClient: fromNetworkClient,
    rawAmount: params.rawAmount,
    route
  });
}
