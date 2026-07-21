import { EvmTokenDetails, getOnChainTokenDetails, Networks, OnChainToken } from "@vortexfi/shared";
import { Big } from "big.js";
import { calculateEvmBridgeAndNetworkFee, getBridgeTargetTokenDetails } from "../../../core/squidrouter";
import { evmIO } from "../../core/io";
import { defineContext, type SerializableBig } from "../../core/metadata";
import type { ChainBrand, PhaseCtx, PhaseIO, PhaseResult, TokenBrand } from "../../core/types";

export interface SquidRouterSwapMetadata {
  effectiveExchangeRate?: string;
  fromNetwork: Networks;
  fromToken: string;
  inputAmountDecimal: SerializableBig;
  inputAmountRaw: string;
  networkFeeUSD: string;
  outputAmountDecimal: SerializableBig;
  outputAmountRaw: string;
  toNetwork: Networks;
  toToken: string;
}

export const SquidRouterSwapContext = defineContext<SquidRouterSwapMetadata>()("squidRouterSwap");

export async function simulateSquidRouterSwap<
  FromChain extends ChainBrand,
  ToChain extends ChainBrand,
  FromToken extends TokenBrand,
  ToToken extends TokenBrand
>(
  fromChain: FromChain,
  toChain: ToChain,
  fromToken: FromToken,
  toToken: ToToken,
  input: PhaseIO<FromToken, FromChain>,
  ctx: PhaseCtx
): Promise<PhaseResult<PhaseIO<ToToken, ToChain>, SquidRouterSwapMetadata>> {
  if (!ctx.fees?.usd) {
    throw new Error("SquidRouterSwap: Missing ctx.fees.usd - ensure computeFees ran successfully");
  }
  const inputTokenDetails = getOnChainTokenDetails(fromChain as Networks, fromToken) as EvmTokenDetails;
  const bridgeSourceToken = inputTokenDetails.erc20AddressSourceChain;
  const toTokenDetails = getBridgeTargetTokenDetails(toToken as OnChainToken, toChain as Networks);
  const bridgeTargetToken = toTokenDetails.erc20AddressSourceChain;
  const bridgeResult = await calculateEvmBridgeAndNetworkFee({
    amountRaw: input.amountRaw,
    fromNetwork: fromChain as Networks,
    fromToken: bridgeSourceToken,
    originalInputAmountForRateCalc: input.amountRaw,
    rampType: ctx.request.rampType,
    toNetwork: toChain as Networks,
    toToken: bridgeTargetToken
  });
  const outputAmountRaw = new Big(bridgeResult.finalGrossOutputAmountDecimal)
    .times(new Big(10).pow(bridgeResult.outputTokenDecimals))
    .toFixed(0, 0);
  ctx.addNote(
    `SquidRouterSwap: ${input.amount} ${fromToken} on ${fromChain} -> ${bridgeResult.finalGrossOutputAmountDecimal.toFixed()} ${toToken} on ${toChain}`
  );
  return {
    metadata: {
      effectiveExchangeRate: bridgeResult.finalEffectiveExchangeRate,
      fromNetwork: fromChain as Networks,
      fromToken: bridgeSourceToken,
      inputAmountDecimal: input.amount,
      inputAmountRaw: input.amountRaw,
      networkFeeUSD: bridgeResult.networkFeeUSD,
      outputAmountDecimal: bridgeResult.finalGrossOutputAmountDecimal,
      outputAmountRaw,
      toNetwork: toChain as Networks,
      toToken: bridgeTargetToken
    },
    output: evmIO(toToken, toChain, bridgeResult.finalGrossOutputAmountDecimal, outputAmountRaw)
  };
}
