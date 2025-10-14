import {
  AXL_USDC_MOONBEAM,
  createRandomString,
  createRouteParamsWithMoonbeamPostHook,
  createSquidRouterHash,
  ERC20_EURE_POLYGON,
  EvmClientManager,
  EvmTransactionData,
  encodePayload,
  getSquidRouterConfig,
  Networks,
  SquidrouterRoute
} from "@packages/shared";
import { u8aToHex } from "@polkadot/util";
import { decodeAddress } from "@polkadot/util-crypto";
import { MOONBEAM_SQUIDROUTER_SWAP_MIN_VALUE_RAW, POLYGON_SQUIDROUTER_SWAP_MIN_VALUE_RAW } from "./config";
import { createGenericRouteParams, createTransactionDataFromRoute, getRoute } from "./route";

export interface OnrampSquidrouterParamsFromMoonbeam {
  fromAddress: string;
  rawAmount: string;
  fromToken: `0x${string}`;
  toToken: `0x${string}`;
  toNetwork: Networks;
  destinationAddress: string;
  moonbeamEphemeralStartingNonce: number;
}

export interface OnrampSquidrouterParamsFromPolygon {
  fromAddress: string;
  rawAmount: string;
  fromToken: `0x${string}`;
  toToken: `0x${string}`;
  toNetwork: Networks;
  destinationAddress: string;
}

export interface OnrampTransactionData {
  approveData: EvmTransactionData;
  swapData: EvmTransactionData;
  route: SquidrouterRoute;
  squidRouterQuoteId?: string;
  squidRouterReceiverHash?: string;
  squidRouterReceiverId?: string;
}

export async function createOnrampSquidrouterTransactionsFromMoonbeamToEvm(
  params: OnrampSquidrouterParamsFromMoonbeam
): Promise<OnrampTransactionData> {
  const evmClientManager = EvmClientManager.getInstance();
  const moonbeamClient = evmClientManager.getClient(Networks.Moonbeam);
  const fromNetwork = Networks.Moonbeam;

  const routeParams = createGenericRouteParams({ ...params, amount: params.rawAmount, fromNetwork });

  try {
    const routeResult = await getRoute(routeParams);
    const { route } = routeResult.data;

    const { approveData, swapData, squidRouterQuoteId } = await createTransactionDataFromRoute({
      inputTokenErc20Address: AXL_USDC_MOONBEAM,
      nonce: params.moonbeamEphemeralStartingNonce,
      publicClient: moonbeamClient,
      rawAmount: params.rawAmount,
      route,
      swapValue: MOONBEAM_SQUIDROUTER_SWAP_MIN_VALUE_RAW
    });

    return {
      approveData,
      route,
      squidRouterQuoteId,
      swapData
    };
  } catch (e) {
    throw new Error(`Error getting route: ${routeParams}. Error: ${e}`);
  }
}

// Onramp from Polygon directly to any token on any EVM chain.
export async function createOnrampSquidrouterTransactionsFromPolygonToEvm(
  params: OnrampSquidrouterParamsFromPolygon
): Promise<OnrampTransactionData> {
  if (params.toNetwork === Networks.AssetHub) {
    // This error indicates a bug in our code, as AssetHub onramps should be handled differently.
    throw new Error("AssetHub is not supported for this flow. Use a different function.");
  }

  const evmClientManager = EvmClientManager.getInstance();
  const polygonClient = evmClientManager.getClient(Networks.Polygon);
  const fromNetwork = Networks.Polygon;

  const routeParams = createGenericRouteParams({ ...params, amount: params.rawAmount, fromNetwork });

  try {
    const routeResult = await getRoute(routeParams);
    const { route } = routeResult.data;

    const { approveData, swapData, squidRouterQuoteId } = await createTransactionDataFromRoute({
      inputTokenErc20Address: ERC20_EURE_POLYGON,
      publicClient: polygonClient,
      rawAmount: params.rawAmount,
      route,
      swapValue: POLYGON_SQUIDROUTER_SWAP_MIN_VALUE_RAW
    });
    return {
      approveData,
      route,
      squidRouterQuoteId,
      swapData
    };
  } catch (e) {
    throw new Error(`Error getting route: ${routeParams}. Error: ${e}`);
  }
}

// Onramp from Polygon directly to any token on any EVM chain.
export async function createOnrampSquidrouterTransactionsFromPolygonToMoonbeamWithPendulumPosthook(
  params: Omit<OnrampSquidrouterParamsFromPolygon, "toNetwork">
): Promise<OnrampTransactionData> {
  const evmClientManager = EvmClientManager.getInstance();
  const polygonClient = evmClientManager.getClient(Networks.Polygon);
  const fromNetwork = Networks.Polygon;

  const squidRouterReceiverId = createRandomString(32);
  const pendulumEphemeralAccountHex = u8aToHex(decodeAddress(params.destinationAddress));
  const squidRouterPayload = encodePayload(pendulumEphemeralAccountHex);
  const squidRouterReceiverHash = createSquidRouterHash(squidRouterReceiverId, squidRouterPayload);
  const { receivingContractAddress } = getSquidRouterConfig(fromNetwork);

  const routeParams = createRouteParamsWithMoonbeamPostHook({
    ...params,
    amount: params.rawAmount,
    fromNetwork,
    receivingContractAddress,
    squidRouterReceiverHash
  });

  try {
    const routeResult = await getRoute(routeParams);
    const { route } = routeResult.data;

    const { approveData, swapData, squidRouterQuoteId } = await createTransactionDataFromRoute({
      inputTokenErc20Address: ERC20_EURE_POLYGON,
      publicClient: polygonClient,
      rawAmount: params.rawAmount,
      route,
      swapValue: POLYGON_SQUIDROUTER_SWAP_MIN_VALUE_RAW
    });

    return {
      approveData,
      route,
      squidRouterQuoteId,
      squidRouterReceiverHash,
      squidRouterReceiverId,
      swapData
    };
  } catch (e) {
    throw new Error(`Error getting route: ${routeParams}. Error: ${e}`);
  }
}
