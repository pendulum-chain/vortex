import { describe, expect, it } from "bun:test";
import {
  EvmToken,
  evmTokenConfig,
  getNetworkId,
  Networks,
} from "@vortexfi/shared";
import {
  prepareSquidrouterRouteParams,
  type SquidrouterQuoteRouteParams,
} from "../core/squidrouter-route";

const SELL_ROUTE_CASES: Array<{
  label: string;
  params: SquidrouterQuoteRouteParams;
}> = [
  {
    label: "Base settlement used by BRL and EUR offramps",
    params: {
      amountRaw: "100000000",
      fromNetwork: Networks.Base,
      fromToken:
        evmTokenConfig[Networks.Base][EvmToken.EURC]!.erc20AddressSourceChain,
      toToken:
        evmTokenConfig[Networks.Base][EvmToken.USDC]!.erc20AddressSourceChain,
      toNetwork: Networks.Base,
    },
  },
  {
    label: "Polygon settlement used by Alfredpay offramps",
    params: {
      amountRaw: "100000000",
      fromNetwork: Networks.Base,
      fromToken:
        evmTokenConfig[Networks.Base][EvmToken.USDC]!.erc20AddressSourceChain,
      toToken:
        evmTokenConfig[Networks.Polygon][EvmToken.USDT]!
          .erc20AddressSourceChain,
      toNetwork: Networks.Polygon,
    },
  },
];

describe("SquidRouter SELL quote routes", () => {
  it.each(SELL_ROUTE_CASES)("routes to the requested $label", ({ params }) => {
    const route = prepareSquidrouterRouteParams(params);

    expect(route.fromChain).toBe(getNetworkId(params.fromNetwork).toString());
    expect(route.fromToken.toLowerCase()).toBe(params.fromToken.toLowerCase());
    expect(route.toChain).toBe(getNetworkId(params.toNetwork).toString());
    expect(route.toToken.toLowerCase()).toBe(params.toToken.toLowerCase());
    expect(route.toChain).not.toBe(getNetworkId(Networks.Moonbeam).toString());
    expect(route.postHook).toBeUndefined();
  });
});
