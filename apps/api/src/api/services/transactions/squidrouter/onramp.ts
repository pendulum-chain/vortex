import { AXL_USDC_MOONBEAM, EvmAddress, EvmTokenDetails, Networks } from "@packages/shared";
import { EvmClientManager } from "../../evm/clientManager";
import { ERC20_EURE_POLYGON } from "../../monerium";
import { MOONBEAM_SQUIDROUTER_SWAP_MIN_VALUE_RAW, POLYGON_SQUIDROUTER_SWAP_MIN_VALUE_RAW } from "./config";
import { createGenericRouteParams, createOnrampRouteParams, createTransactionDataFromRoute, getRoute } from "./route";

export interface OnrampSquidrouterParams {
  fromAddress: string;
  rawAmount: string;
  outputTokenDetails: EvmTokenDetails;
  toNetwork: Networks;
  addressDestination: string;
  moonbeamEphemeralStartingNonce: number;
}

export interface OnrampSquidrouterParamsToEvm {
  fromAddress: string;
  rawAmount: string;
  outputTokenDetails: EvmTokenDetails;
  inputTokenDetails: EvmTokenDetails;
  toNetwork: Networks;
  fromNetwork: Networks;
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
}

export async function createOnrampSquidrouterTransactions(params: OnrampSquidrouterParams): Promise<OnrampTransactionData> {
  if (params.toNetwork === Networks.AssetHub) {
    throw new Error("AssetHub is not supported for Squidrouter onramp");
  }

  const evmClientManager = EvmClientManager.getInstance();
  const publicClient = evmClientManager.getClient(Networks.Moonbeam);

  const routeParams = createOnrampRouteParams(
    params.fromAddress,
    params.rawAmount,
    params.outputTokenDetails,
    params.toNetwork,
    params.addressDestination
  );

  try {
    const routeResult = await getRoute(routeParams);
    const { route } = routeResult.data;

    return await createTransactionDataFromRoute({
      inputTokenErc20Address: AXL_USDC_MOONBEAM,
      nonce: params.moonbeamEphemeralStartingNonce,
      publicClient,
      rawAmount: params.rawAmount,
      route,
      swapValue: MOONBEAM_SQUIDROUTER_SWAP_MIN_VALUE_RAW
    });
  } catch (e) {
    throw new Error(`Error getting route: ${routeParams}. Error: ${e}`);
  }
}

export async function createOnrampSquidrouterTransactionsToEvm(
  params: OnrampSquidrouterParamsToEvm
): Promise<OnrampTransactionData> {
  if (params.toNetwork === Networks.AssetHub) {
    throw new Error("AssetHub is not supported for Squidrouter onramp");
  }

  const evmClientManager = EvmClientManager.getInstance();
  const publicClient = evmClientManager.getClient(Networks.Polygon);

  const routeParams = createGenericRouteParams(
    params.fromAddress,
    params.rawAmount,
    params.inputTokenDetails,
    params.outputTokenDetails,
    params.fromNetwork,
    params.toNetwork,
    params.destinationAddress
  );

  try {
    const routeResult = await getRoute(routeParams);
    const { route } = routeResult.data;

    return await createTransactionDataFromRoute({
      inputTokenErc20Address: ERC20_EURE_POLYGON,
      publicClient,
      rawAmount: params.rawAmount,
      route,
      swapValue: POLYGON_SQUIDROUTER_SWAP_MIN_VALUE_RAW
    });
  } catch (e) {
    throw new Error(`Error getting route: ${routeParams}. Error: ${e}`);
  }
}
