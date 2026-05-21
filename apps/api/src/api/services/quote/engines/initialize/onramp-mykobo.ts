import { ERC20_EURC_BASE_DECIMALS, multiplyByPowerOfTen, RampDirection } from "@vortexfi/shared";
import Big from "big.js";
import { QuoteContext } from "../../core/types";
import { BaseInitializeEngine } from "./index";

export class OnRampInitializeMykoboEngine extends BaseInitializeEngine {
  readonly config = {
    direction: RampDirection.BUY,
    skipNote: "OnRampInitializeMykoboEngine: Skipped because rampType is SELL, this engine handles BUY operations only"
  };

  protected async executeInternal(ctx: QuoteContext): Promise<void> {
    const req = ctx.request;

    const eurTokenDecimals = ERC20_EURC_BASE_DECIMALS;
    const inputAmountDecimal = new Big(req.inputAmount);
    const inputAmountRaw = multiplyByPowerOfTen(inputAmountDecimal, eurTokenDecimals).toFixed(0, 0);
    const mykoboFee = Big(0);
    const outputAmountDecimal = inputAmountDecimal.minus(mykoboFee);
    const outputAmountRaw = multiplyByPowerOfTen(outputAmountDecimal, eurTokenDecimals).toFixed(0, 0);

    ctx.mykoboMint = {
      currency: ctx.request.inputCurrency,
      fee: mykoboFee,
      inputAmountDecimal,
      inputAmountRaw,
      outputAmountDecimal,
      outputAmountRaw
    };

    ctx.addNote?.(
      `Initialized: ${inputAmountDecimal.toString()} ${req.inputCurrency} -> ${outputAmountDecimal.toString()} ${req.outputCurrency} (fee: ${mykoboFee.toString()})`
    );
  }
}
