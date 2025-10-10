import {
  AXL_USDC_MOONBEAM,
  AXL_USDC_MOONBEAM_DETAILS,
  ERC20_EURE_POLYGON,
  EvmAddress,
  EvmClientManager,
  EvmTokenDetails,
  Networks
} from "@packages/shared";
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
  approveData: {
    to: EvmAddress;
    data: EvmAddress;
    value: string;
    gas: string;
    nonce?: number;
    maxFeePerGas?: string;
    maxPriorityFeePerGas?: string;
  };
  swapData: {
    to: EvmAddress;
    data: EvmAddress;
    value: string;
    gas: string;
    nonce?: number;
    maxFeePerGas?: string;
    maxPriorityFeePerGas?: string;
  };
  squidRouterQuoteId?: string;
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

    return await createTransactionDataFromRoute({
      inputTokenErc20Address: AXL_USDC_MOONBEAM,
      nonce: params.moonbeamEphemeralStartingNonce,
      publicClient: moonbeamClient,
      rawAmount: params.rawAmount,
      route,
      swapValue: MOONBEAM_SQUIDROUTER_SWAP_MIN_VALUE_RAW
    });
  } catch (e) {
    throw new Error(`Error getting route: ${routeParams}. Error: ${e}`);
  }
}

// Onramp transaction from polygon to Moonbeam (always axlUSDC. Tokens are later send to AssetHub via XCM.
export async function createOnrampSquidrouterTransactionsFromPolygonToAssethub(
  params: OnrampSquidrouterParamsFromPolygon
): Promise<OnrampTransactionData> {
  if (params.toNetwork !== Networks.AssetHub) {
    throw new Error("toNetwork must be AssetHub for this flow.");
  }

  const evmClientManager = EvmClientManager.getInstance();
  const polygonClient = evmClientManager.getClient(Networks.Polygon);

  // The output token is always axlUSDC on Moonbeam for AssetHub onramps via Squidrouter
  const toToken = AXL_USDC_MOONBEAM_DETAILS.erc20AddressSourceChain;
  const fromNetwork = Networks.Polygon;
  const toNetwork = Networks.Moonbeam;

  const routeParams = createGenericRouteParams({ ...params, amount: params.rawAmount, fromNetwork, toNetwork, toToken });

  try {
    const routeResult = await getRoute(routeParams);
    const { route } = routeResult.data;

    return await createTransactionDataFromRoute({
      inputTokenErc20Address: ERC20_EURE_POLYGON,
      publicClient: polygonClient,
      rawAmount: params.rawAmount,
      route,
      swapValue: POLYGON_SQUIDROUTER_SWAP_MIN_VALUE_RAW
    });
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

    return await createTransactionDataFromRoute({
      inputTokenErc20Address: ERC20_EURE_POLYGON,
      publicClient: polygonClient,
      rawAmount: params.rawAmount,
      route,
      swapValue: POLYGON_SQUIDROUTER_SWAP_MIN_VALUE_RAW
    });
  } catch (e) {
    throw new Error(`Error getting route: ${routeParams}. Error: ${e}`);
  }
}
