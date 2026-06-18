import { EvmTokenDetails, getOnChainTokenDetails, Networks, OnChainToken } from "@vortexfi/shared";
import { Big } from "big.js";
import { calculateEvmBridgeAndNetworkFee, getBridgeTargetTokenDetails } from "../../core/squidrouter";
import { evmIO } from "../core/io";
import type { ChainBrand, Phase, PhaseCtx, PhaseIO, TokenBrand } from "../core/types";

export function SquidRouterSwap<FromChain extends ChainBrand, ToChain extends ChainBrand, Token extends TokenBrand>(
  fromChain: FromChain,
  toChain: ToChain,
  token: Token
): Phase<PhaseIO<Token, FromChain>, PhaseIO<Token, ToChain>> {
  return {
    name: `SquidRouterSwap(${fromChain}->${toChain}/${token})`,
    phases: ["squidRouterSwap", "squidRouterPay"],
    async simulate(input: PhaseIO<Token, FromChain>, ctx: PhaseCtx): Promise<PhaseIO<Token, ToChain>> {
      if (!ctx.fees?.usd) {
        throw new Error("SquidRouterSwap: Missing ctx.fees.usd - ensure computeFees ran successfully");
      }

      const inputTokenDetails = getOnChainTokenDetails(fromChain as Networks, token) as EvmTokenDetails;

      const fromToken = inputTokenDetails.erc20AddressSourceChain;
      const toTokenDetails = getBridgeTargetTokenDetails(ctx.request.outputCurrency as OnChainToken, toChain as Networks);
      const toToken = toTokenDetails.erc20AddressSourceChain;

      const bridgeRequest = {
        amountRaw: input.amountRaw,
        fromNetwork: fromChain as Networks,
        fromToken,
        originalInputAmountForRateCalc: input.amountRaw,
        rampType: ctx.request.rampType,
        toNetwork: toChain as Networks,
        toToken
      };

      const bridgeResult = await calculateEvmBridgeAndNetworkFee(bridgeRequest);

      const outputAmountRaw = new Big(bridgeResult.finalGrossOutputAmountDecimal)
        .times(new Big(10).pow(bridgeResult.outputTokenDecimals))
        .toFixed(0, 0);

      ctx.addNote(
        `SquidRouterSwap: ${input.amount} ${token} on ${fromChain} -> ${bridgeResult.finalGrossOutputAmountDecimal.toFixed()} ${token} on ${toChain}`
      );

      return evmIO(token, toChain, bridgeResult.finalGrossOutputAmountDecimal, outputAmountRaw, {
        ...input.meta,
        evmToEvm: {
          effectiveExchangeRate: bridgeResult.finalEffectiveExchangeRate,
          fromNetwork: fromChain as Networks,
          fromToken,
          inputAmountDecimal: input.amount,
          inputAmountRaw: input.amountRaw,
          networkFeeUSD: bridgeResult.networkFeeUSD,
          outputAmountDecimal: bridgeResult.finalGrossOutputAmountDecimal,
          outputAmountRaw,
          toNetwork: toChain as Networks,
          toToken
        }
      });
    }
  };
}
