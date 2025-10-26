import { EvmTransactionData, Networks, SquidrouterRoute } from "@packages/shared";
import { u8aToHex } from "@polkadot/util";
import { decodeAddress } from "@polkadot/util-crypto";
import { createRandomString, createSquidRouterHash } from "../../helpers/squidrouter";
import { EvmClientManager } from "../evm/clientManager";
import { getSquidRouterConfig } from "./config";
import { encodePayload } from "./payload";
import {
  createGenericRouteParams,
  createRouteParamsWithMoonbeamPostHook,
  createTransactionDataFromRoute,
  getRoute
} from "./route";

export interface OfframpSquidrouterParams {
  fromAddress: string;
  rawAmount: string;
  fromToken: `0x${string}`;
  toToken: `0x${string}`;
  fromNetwork: Networks;
  pendulumAddressDestination: string;
}

export interface OfframpSquidrouterParamsToEvm {
  fromAddress: string;
  rawAmount: string;
  fromToken: `0x${string}`;
  toToken: `0x${string}`;
  fromNetwork: Networks;
  toNetwork: Networks;
  destinationAddress: string;
}

export interface OfframpTransactionData {
  approveData: EvmTransactionData;
  swapData: EvmTransactionData;
  squidRouterReceiverId: string;
  squidRouterReceiverHash: string;
  route: SquidrouterRoute;
  squidRouterQuoteId?: string;
}

export interface OfframpTransactionDataToEvm {
  approveData: EvmTransactionData;
  swapData: EvmTransactionData;
  squidRouterQuoteId?: string;
}

export async function createOfframpSquidrouterTransactions(params: OfframpSquidrouterParams): Promise<OfframpTransactionData> {
  if (params.fromNetwork === Networks.AssetHub) {
    throw new Error("AssetHub is not supported for Squidrouter offramp");
  }

  const evmClientManager = EvmClientManager.getInstance();
  const moonbeamClient = evmClientManager.getClient(Networks.Moonbeam);

  const squidRouterReceiverId = createRandomString(32);
  const pendulumEphemeralAccountHex = u8aToHex(decodeAddress(params.pendulumAddressDestination));
  const squidRouterPayload = encodePayload(pendulumEphemeralAccountHex);
  const squidRouterReceiverHash = createSquidRouterHash(squidRouterReceiverId, squidRouterPayload);
  const { receivingContractAddress } = getSquidRouterConfig(params.fromNetwork);

  const routeParams = createRouteParamsWithMoonbeamPostHook({
    amount: params.rawAmount,
    fromAddress: params.fromAddress,
    fromNetwork: params.fromNetwork,
    fromToken: params.fromToken,
    receivingContractAddress,
    squidRouterReceiverHash
  });

  const routeResult = await getRoute(routeParams);
  const { route } = routeResult.data;

  const { approveData, swapData, squidRouterQuoteId } = await createTransactionDataFromRoute({
    inputTokenErc20Address: params.fromToken,
    publicClient: moonbeamClient,
    rawAmount: params.rawAmount,
    route
  });

  return {
    approveData,
    route,
    squidRouterQuoteId,
    squidRouterReceiverHash,
    squidRouterReceiverId,
    swapData
  };
}

export async function createOfframpSquidrouterTransactionsToEvm(
  params: OfframpSquidrouterParamsToEvm
): Promise<OfframpTransactionDataToEvm> {
  if (params.fromNetwork === Networks.AssetHub) {
    throw new Error("AssetHub is not supported for Squidrouter offramp");
  }

  const evmClientManager = EvmClientManager.getInstance();
  const moonbeamClient = evmClientManager.getClient(Networks.Moonbeam);

  const routeParams = createGenericRouteParams({ amount: params.rawAmount, ...params });

  const routeResult = await getRoute(routeParams);
  const { route } = routeResult.data;

  return createTransactionDataFromRoute({
    inputTokenErc20Address: params.fromToken,
    publicClient: moonbeamClient,
    rawAmount: params.rawAmount,
    route
  });
}
