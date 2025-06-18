import { AXL_USDC_MOONBEAM, EvmAddress, EvmTokenDetails, Networks } from "@packages/shared";
import { createPublicClient, encodeFunctionData, http } from "viem";
import { moonbeam } from "viem/chains";
import erc20ABI from "../../../../contracts/ERC20";
import { MOONBEAM_SQUIDROUTER_SWAP_MIN_VALUE_RAW } from "./config";
import { createOnrampRouteParams, getRoute } from "./route";

export interface OnrampSquidrouterParams {
  fromAddress: string;
  rawAmount: string;
  outputTokenDetails: EvmTokenDetails;
  toNetwork: Networks;
  addressDestination: string;
  moonbeamEphemeralStartingNonce: number;
}

export interface OnrampTransactionData {
  approveData: {
    to: EvmAddress;
    data: EvmAddress;
    value: string;
    gas: string;
    nonce: number;
    maxFeePerGas?: string;
    maxPriorityFeePerGas?: string;
  };
  swapData: {
    to: EvmAddress;
    data: EvmAddress;
    value: string;
    gas: string;
    nonce: number;
    maxFeePerGas?: string;
    maxPriorityFeePerGas?: string;
  };
}

export async function createOnrampSquidrouterTransactions(params: OnrampSquidrouterParams): Promise<OnrampTransactionData> {
  if (params.toNetwork === Networks.AssetHub) {
    throw new Error("AssetHub is not supported for Squidrouter onramp");
  }

  const publicClient = createPublicClient({
    chain: moonbeam,
    transport: http()
  });

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
    const { transactionRequest } = route;

    const approveTransactionData = encodeFunctionData({
      abi: erc20ABI,
      args: [transactionRequest?.target, params.rawAmount],
      functionName: "approve"
    });

    const { maxFeePerGas, maxPriorityFeePerGas } = await publicClient.estimateFeesPerGas();

    // Create transaction data objects
    const approveData = {
      data: approveTransactionData,
      gas: "150000",
      maxFeePerGas: maxFeePerGas.toString(),
      maxPriorityFeePerGas: maxPriorityFeePerGas.toString(),
      nonce: params.moonbeamEphemeralStartingNonce,
      to: AXL_USDC_MOONBEAM as EvmAddress,
      value: "0"
    };

    const swapData = {
      data: transactionRequest.data as EvmAddress,
      gas: transactionRequest.gasLimit,
      maxFeePerGas: maxFeePerGas.toString(),
      maxPriorityFeePerGas: maxPriorityFeePerGas.toString(),
      nonce: params.moonbeamEphemeralStartingNonce + 1,
      to: transactionRequest.target as EvmAddress,
      value: MOONBEAM_SQUIDROUTER_SWAP_MIN_VALUE_RAW
    };

    return {
      approveData,
      swapData
    };
  } catch (e) {
    throw new Error(`Error getting route: ${routeParams}. Error: ${e}`);
  }
}
