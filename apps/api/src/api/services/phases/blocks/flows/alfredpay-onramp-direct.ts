import { ALFREDPAY_EVM_TOKEN, type EvmNetworks, EvmToken, FiatToken, Networks } from "@vortexfi/shared";
import { FlowBuilder } from "../core/flow";
import { fiatRequestIO } from "../core/io";
import { assemblePhaseFlow } from "../core/phase-flow";
import type { TokenBrand } from "../core/types";
import { AlfredpayMint } from "../phases/alfredpay-mint";
import { DestinationTransfer } from "../phases/destination-transfer";
import { DistributeFees } from "../phases/distribute-fees";
import { FinalSettlementSubsidy } from "../phases/final-settlement-subsidy";
import { FundEphemeral } from "../phases/fund-ephemeral";
import { SameChainSquidRouterSwap, SquidRouterPassthrough } from "../phases/squid-router-swap";
import { AlfredpaySubsidizePre } from "../phases/subsidize-pre";

// Version 2 appends the Polygon fee-collection phase: the vortex/partner fee residual
// that AlfredpaySubsidizePre deducts from the mint is paid out from the Polygon
// ephemeral after the user's destination transfer succeeded. Deploys are gated on
// draining v1 quotes/ramps.
export const ALFREDPAY_ONRAMP_FLOW_VERSION = 2;

function distributeAlfredpayFees<Token extends TokenBrand, Chain extends string>() {
  return DistributeFees<Token, Chain>({
    deductFromAmount: false,
    feeToken: ALFREDPAY_EVM_TOKEN,
    network: Networks.Polygon as EvmNetworks
  });
}

export function makeAlfredpayOnrampDirectFlow<ToToken extends TokenBrand>(toToken: ToToken) {
  const start = FlowBuilder.start(fiatRequestIO(FiatToken.ARS, FiatToken.COP, FiatToken.MXN, FiatToken.USD), AlfredpayMint)
    .pipe(FundEphemeral(ALFREDPAY_EVM_TOKEN, Networks.Polygon))
    .pipe(AlfredpaySubsidizePre<typeof ALFREDPAY_EVM_TOKEN, typeof Networks.Polygon>());

  if (toToken === ALFREDPAY_EVM_TOKEN) {
    return start
      .pipe(SquidRouterPassthrough(ALFREDPAY_EVM_TOKEN, Networks.Polygon))
      .pipe(FinalSettlementSubsidy<typeof ALFREDPAY_EVM_TOKEN, typeof Networks.Polygon>())
      .pipe(DestinationTransfer<typeof ALFREDPAY_EVM_TOKEN, typeof Networks.Polygon>())
      .pipe(distributeAlfredpayFees<typeof ALFREDPAY_EVM_TOKEN, typeof Networks.Polygon>())
      .build("AlfredpayOnrampDirect", {}, ALFREDPAY_ONRAMP_FLOW_VERSION);
  }

  return start
    .pipe(SameChainSquidRouterSwap(Networks.Polygon, ALFREDPAY_EVM_TOKEN, toToken))
    .pipe(FinalSettlementSubsidy<ToToken, typeof Networks.Polygon>())
    .pipe(DestinationTransfer<ToToken, typeof Networks.Polygon>())
    .pipe(distributeAlfredpayFees<ToToken, typeof Networks.Polygon>())
    .build("AlfredpayOnrampDirect", {}, ALFREDPAY_ONRAMP_FLOW_VERSION);
}

export const alfredpayOnrampDirectFlow = makeAlfredpayOnrampDirectFlow(EvmToken.USDC);
export const alfredpayOnrampDirectPhaseFlow = assemblePhaseFlow(alfredpayOnrampDirectFlow);
