import { EvmTokenDetails, EvmTransactionData, Networks } from "@packages/shared";
import { u8aToHex } from "@polkadot/util";
import { decodeAddress } from "@polkadot/util-crypto";
import { createRandomString, createSquidRouterHash } from "../../../helpers/squidrouter";
import { EvmClientManager } from "../../evm/clientManager";
import { getSquidRouterConfig } from "./config";
import encodePayload from "./payload";
import { createGenericRouteParams, createOfframpRouteParams, createTransactionDataFromRoute, getRoute } from "./route";

export interface OfframpSquidrouterParams {
  fromAddress: string;
  rawAmount: string;
  inputTokenDetails: EvmTokenDetails;
  fromNetwork: Networks;
  pendulumAddressDestination: string;
}

export interface OfframpSquidrouterParamsToEvm {
  fromAddress: string;
  rawAmount: string;
  inputTokenDetails: EvmTokenDetails;
  outputTokenDetails: EvmTokenDetails;
  fromNetwork: Networks;
  toNetwork: Networks;
  destinationAddress: string;
}

export interface OfframpTransactionData {
  approveData: EvmTransactionData;
  swapData: EvmTransactionData;
  squidRouterReceiverId: string;
  squidRouterReceiverHash: string;
}

export interface OfframpTransactionDataToEvm {
  approveData: EvmTransactionData;
  swapData: EvmTransactionData;
}

export async function createOfframpSquidrouterTransactions(params: OfframpSquidrouterParams): Promise<OfframpTransactionData> {
  if (params.fromNetwork === Networks.AssetHub) {
    throw new Error("AssetHub is not supported for Squidrouter offramp");
  }

  const evmClientManager = EvmClientManager.getInstance();
  const publicClient = evmClientManager.getClient(Networks.Moonbeam);

  const squidRouterReceiverId = createRandomString(32);
  const pendulumEphemeralAccountHex = u8aToHex(decodeAddress(params.pendulumAddressDestination));
  const squidRouterPayload = encodePayload(pendulumEphemeralAccountHex);
  const squidRouterReceiverHash = createSquidRouterHash(squidRouterReceiverId, squidRouterPayload);
  const { receivingContractAddress } = getSquidRouterConfig(params.fromNetwork);

  const routeParams = createOfframpRouteParams(
    params.fromAddress,
    params.rawAmount,
    params.inputTokenDetails,
    params.fromNetwork,
    receivingContractAddress,
    squidRouterReceiverHash
  );

  const routeResult = await getRoute(routeParams);
  const { route } = routeResult.data;

  const { approveData, swapData } = await createTransactionDataFromRoute({
    inputTokenErc20Address: params.inputTokenDetails.erc20AddressSourceChain,
    publicClient,
    rawAmount: params.rawAmount,
    route
  });

  return {
    approveData,
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
  const publicClient = evmClientManager.getClient(Networks.Moonbeam);

  const routeParams = createGenericRouteParams(
    params.fromAddress,
    params.rawAmount,
    params.inputTokenDetails,
    params.outputTokenDetails,
    params.fromNetwork,
    params.toNetwork,
    params.destinationAddress
  );

  const routeResult = await getRoute(routeParams);
  const { route } = routeResult.data;

  return createTransactionDataFromRoute({
    inputTokenErc20Address: params.inputTokenDetails.erc20AddressSourceChain,
    publicClient,
    rawAmount: params.rawAmount,
    route
  });
}
