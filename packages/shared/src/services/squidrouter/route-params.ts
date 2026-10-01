import splitReceiverABI from "../../contracts/moonbeam/splitReceiverABI.json";
import { getNetworkId, Networks } from "../../index";
import type { RouteParams } from "./route";

export { splitReceiverABI };

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
