import { EvmToken, FiatToken, Networks } from "@vortexfi/shared";
import { FlowBuilder } from "../core/flow";
import { fiatRequestIO } from "../core/io";
import type { ChainBrand, TokenBrand } from "../core/types";
import { DestinationTransfer } from "../phases/destination-transfer";
import { DistributeFees } from "../phases/distribute-fees";
import { FinalSettlementSubsidy } from "../phases/final-settlement-subsidy";
import { FundEphemeral } from "../phases/fund-ephemeral";
import { MoneriumIssue } from "../phases/monerium-issue";
import { MONERIUM_EURE } from "../phases/monerium-issue/simulation";
import { MoneriumSelfTransfer } from "../phases/monerium-self-transfer";
import { SquidRouterSwap } from "../phases/squid-router-swap";
import { SubsidizePost } from "../phases/subsidize-post";
import { PolygonEureUsdcUniswapSwap } from "../phases/uniswap-v3-fixed-swap";

export function makeMoneriumOnrampPolygonCrossChainFlow<ToChain extends ChainBrand, ToToken extends TokenBrand>(
  toChain: ToChain,
  toToken: ToToken,
  issueFeeEur: string
) {
  return FlowBuilder.start(fiatRequestIO(FiatToken.EURC), MoneriumIssue(Networks.Polygon, issueFeeEur))
    .pipe(FundEphemeral(MONERIUM_EURE, Networks.Polygon))
    .pipe(MoneriumSelfTransfer<typeof Networks.Polygon>())
    .pipe(PolygonEureUsdcUniswapSwap)
    .pipe(
      DistributeFees<typeof EvmToken.USDC, typeof Networks.Polygon>({
        feeToken: EvmToken.USDC,
        network: Networks.Polygon
      })
    )
    .pipe(SubsidizePost<typeof EvmToken.USDC, typeof Networks.Polygon>())
    .pipe(SquidRouterSwap(Networks.Polygon, toChain, EvmToken.USDC, toToken))
    .pipe(FinalSettlementSubsidy<ToToken, ToChain>())
    .pipe(DestinationTransfer<ToToken, ToChain>())
    .build("MoneriumOnrampPolygonCrossChain", { isDirectTransfer: false });
}
