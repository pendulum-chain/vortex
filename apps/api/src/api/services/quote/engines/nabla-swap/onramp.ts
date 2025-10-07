import {
  AssetHubToken,
  EvmToken,
  FiatToken,
  getPendulumDetails,
  multiplyByPowerOfTen,
  Networks,
  PENDULUM_USDC_AXL,
  RampDirection
} from "@packages/shared";
import { calculateNablaSwapOutput } from "../../core/nabla";
import { QuoteContext, Stage, StageKey } from "../../core/types";

export class OnRampSwapEngine implements Stage {
  readonly key = StageKey.OnRampNablaSwap;

  async execute(ctx: QuoteContext): Promise<void> {
    const req = ctx.request;

    if (req.rampType !== RampDirection.BUY) {
      ctx.addNote?.("Skipped for off-ramp request");
      return;
    }

    if (!ctx.fees?.usd) {
      throw new Error("OnRampSwapEngine requires usd fees to be calculated first");
    }

    let amountReceivedOnPendulum: Big;
    if (ctx.evmToMoonbeam) {
      // Amount received on Pendulum via Squidrouter postcall hook
      amountReceivedOnPendulum = ctx.evmToMoonbeam.outputAmountDecimal;
    } else if (ctx.moonbeamToPendulumXcm) {
      amountReceivedOnPendulum = ctx.moonbeamToPendulumXcm.outputAmountDecimal;
    } else {
      throw new Error("OnRampSwapEngine: Missing evmToMoonbeam or moonbeamToPendulumXcm quote data from previous stage");
    }

    // All fees can be considered pre-swap fees on the on-ramp side
    // Also, the input currency for the swap here is always USDC
    const preSwapFees = ctx.fees.usd.total;

    // If we are on-ramping from Sepa, we already swapped EUR to axlUSDC with Squidrouter
    const inputTokenPendulumDetails = req.from === "pix" ? getPendulumDetails(FiatToken.BRL) : PENDULUM_USDC_AXL;
    const outputTokenPendulumDetails =
      req.to === "assethub" ? getPendulumDetails(AssetHubToken.USDC, Networks.AssetHub) : PENDULUM_USDC_AXL;

    const inputAmountForSwap = amountReceivedOnPendulum.minus(preSwapFees).toString();
    const inputAmountForSwapRaw = multiplyByPowerOfTen(inputAmountForSwap, inputTokenPendulumDetails.decimals).toString();

    const result = await calculateNablaSwapOutput({
      inputAmountForSwap,
      inputTokenPendulumDetails,
      outputTokenPendulumDetails,
      rampType: req.rampType
    });

    ctx.nablaSwap = {
      effectiveExchangeRate: result.effectiveExchangeRate,
      inputAmountForSwap,
      inputAmountForSwapRaw,
      inputCurrency: inputTokenPendulumDetails.currency,
      inputDecimals: inputTokenPendulumDetails.decimals,
      outputAmountDecimal: result.nablaOutputAmountDecimal,
      outputAmountRaw: result.nablaOutputAmountRaw,
      outputCurrency: outputTokenPendulumDetails.currency,
      outputDecimals: outputTokenPendulumDetails.decimals
    };

    ctx.addNote?.(
      `Nabla swap from ${inputTokenPendulumDetails.currency} to ${outputTokenPendulumDetails.currency}, input amount ${inputAmountForSwap}, output amount ${result.nablaOutputAmountDecimal.toFixed()}`
    );
  }
}
