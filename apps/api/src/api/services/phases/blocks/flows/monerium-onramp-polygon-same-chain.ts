import { EvmToken, Networks } from "@vortexfi/shared";
import type { TokenBrand } from "../core/types";
import { DestinationTransfer } from "../phases/destination-transfer";
import { SameChainSquidRouterSwap } from "../phases/squid-router-swap";
import { moneriumOnrampPolygonUsdcFlow } from "./monerium-onramp-polygon-cross-chain";

/** Polygon destinations settle from the fee-settled USDC directly; other Polygon tokens take one same-chain Squid swap. */
export function makeMoneriumOnrampPolygonSameChainFlow<ToToken extends TokenBrand>(toToken: ToToken, issueFeeEur: string) {
  if (toToken === EvmToken.USDC) {
    return moneriumOnrampPolygonUsdcFlow(issueFeeEur)
      .pipe(DestinationTransfer<typeof EvmToken.USDC, typeof Networks.Polygon>())
      .build("MoneriumOnrampPolygonSameChain", { isDirectTransfer: false });
  }
  return moneriumOnrampPolygonUsdcFlow(issueFeeEur)
    .pipe(SameChainSquidRouterSwap(Networks.Polygon, EvmToken.USDC, toToken))
    .pipe(DestinationTransfer<ToToken, typeof Networks.Polygon>())
    .build("MoneriumOnrampPolygonSameChain", { isDirectTransfer: false });
}
