import { ERC20_EURE_POLYGON_DECIMALS, getPendulumDetails, multiplyByPowerOfTen, RampDirection } from "@packages/shared";
import Big from "big.js";
import { QuoteContext } from "../../core/types";
import { BaseInitializeEngine } from "./index";

export class OnRampInitializeMoneriumEngine extends BaseInitializeEngine {
  readonly config = {
    direction: RampDirection.BUY,
    skipNote: "OnRampInitializeMoneriumEngine: Skipped because rampType is SELL, this engine handles BUY operations only"
  };

  protected async executeInternal(ctx: QuoteContext): Promise<void> {
    const req = ctx.request;

    // Calculate Monerium input and output (of minting/deposit)
    const eurTokenDecimals = ERC20_EURE_POLYGON_DECIMALS;
    const amountIn = new Big(req.inputAmount);
    const amountInRaw = multiplyByPowerOfTen(amountIn, eurTokenDecimals).toFixed(0, 0);
    const moneriumFee = Big(0);
    const amountOut = amountIn.minus(moneriumFee);
    const amountOutRaw = multiplyByPowerOfTen(amountOut, eurTokenDecimals).toFixed(0, 0);

    ctx.moneriumMint = {
      amountIn,
      amountInRaw,
      amountOut,
      amountOutRaw,
      currency: ctx.request.inputCurrency,
      fee: moneriumFee
    };

    ctx.addNote?.(
      `Initialized: ${amountIn.toString()} ${req.inputCurrency} -> ${amountOut.toString()} ${req.outputCurrency} (fee: ${moneriumFee.toString()})`
    );
  }
}
