import { createGenericRouteParams, type Networks, type RouteParams } from "@vortexfi/shared";
import { generatePrivateKey, privateKeyToAddress } from "viem/accounts";

export interface SquidrouterQuoteRouteParams {
  amountRaw: string;
  fromToken: `0x${string}`;
  toToken: `0x${string}`;
  fromNetwork: Networks;
  toNetwork: Networks;
}

/** Build a non-executable route request for quote simulation. */
export function prepareSquidrouterRouteParams(params: SquidrouterQuoteRouteParams): RouteParams {
  const { amountRaw, fromToken, toToken, fromNetwork, toNetwork } = params;
  const placeholderAddress = privateKeyToAddress(generatePrivateKey());

  // Quote the same destination that transaction preparation will execute.
  // Ramp direction does not determine bridge topology: current EVM offramps
  // settle on Base or Polygon rather than routing through legacy Moonbeam hooks.
  return createGenericRouteParams({
    amount: amountRaw,
    destinationAddress: placeholderAddress,
    fromAddress: placeholderAddress,
    fromNetwork,
    fromToken,
    toNetwork,
    toToken
  });
}
