import { encodeFunctionData } from "viem";
import erc20ABI from "../../contracts/ERC20";
import splitReceiverABI from "../../contracts/moonbeam/splitReceiverABI.json";
import { AXL_USDC_MOONBEAM, getNetworkId, Networks } from "../../index";
import type { RouteParams } from "./route";

export { splitReceiverABI };

// This function creates the parameters for the Squidrouter API to get a route for offramping.
// This route will always be from another EVM chain to Moonbeam.
export function createRouteParamsWithMoonbeamPostHook(params: {
  fromAddress: string;
  amount: string;
  fromToken: `0x${string}`;
  fromNetwork: Networks;
  receivingContractAddress: string;
  squidRouterReceiverHash: string;
}): RouteParams {
  const { fromAddress, amount, fromToken, fromNetwork, receivingContractAddress, squidRouterReceiverHash } = params;

  const fromChainId = getNetworkId(fromNetwork);
  const toChainId = getNetworkId(Networks.Moonbeam);

  const approvalErc20 = encodeFunctionData({
    abi: erc20ABI,
    args: [receivingContractAddress, "0"],
    functionName: "approve"
  });

  const initXCMEncodedData = encodeFunctionData({
    abi: splitReceiverABI,
    args: [squidRouterReceiverHash, "0"],
    functionName: "initXCM"
  });

  return {
    bypassGuardrails: true,
    enableExpress: true,
    fromAddress,
    fromAmount: amount,
    fromChain: fromChainId.toString(),
    fromToken,
    postHook: {
      calls: [
        // approval call.
        {
          callData: approvalErc20,
          callType: 1,
          chainType: "evm", // this will be replaced by the full native balance of the multicall after the swap
          estimatedGas: "500000",
          payload: {
            inputPos: "1", // unused // unused in callType 2, dummy value
            tokenAddress: AXL_USDC_MOONBEAM
          },
          target: AXL_USDC_MOONBEAM,
          value: "0"
        },
        // trigger the xcm call
        {
          callData: initXCMEncodedData, // SquidCallType.FULL_TOKEN_BALANCE
          callType: 1,
          chainType: "evm",
          estimatedGas: "700000",
          payload: {
            // this indexes the 256 bit word position of the
            // "amount" parameter in the encoded arguments to the call executeXCMEncodedData
            // i.e., a "1" means that the bits 256-511 are the position of "amount"
            // in the encoded argument list
            inputPos: "1",
            tokenAddress: AXL_USDC_MOONBEAM
          },
          target: receivingContractAddress,
          value: "0"
        }
      ],
      chainType: "evm",
      description: "Pendulum post hook", // This should be the name of your product or application that is triggering the hook
      logoURI: "https://pbs.twimg.com/profile_images/1548647667135291394/W2WOtKUq_400x400.jpg", // Add your product or application's logo here
      provider: "Pendulum"
    },
    slippage: 4,
    toAddress: fromAddress,
    toChain: toChainId.toString(),
    toToken: AXL_USDC_MOONBEAM
  };
}

export function createGenericRouteParams(params: {
  fromAddress: string;
  amount: string;
  fromToken: `0x${string}`;
  toToken: `0x${string}`;
  fromNetwork: Networks;
  toNetwork: Networks;
  destinationAddress: string;
}): RouteParams {
  const { fromAddress, amount, fromToken, toToken, fromNetwork, toNetwork, destinationAddress } = params;

  const fromChainId = getNetworkId(fromNetwork);
  const toChainId = getNetworkId(toNetwork);

  return {
    bypassGuardrails: true,
    enableExpress: true,
    fromAddress,
    fromAmount: amount,
    fromChain: fromChainId.toString(),
    fromToken,
    slippage: 4,
    toAddress: destinationAddress,
    toChain: toChainId.toString(),
    toToken
  };
}
