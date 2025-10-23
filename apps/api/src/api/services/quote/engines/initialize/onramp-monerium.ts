import { ERC20_EURE_POLYGON_DECIMALS, multiplyByPowerOfTen, RampDirection } from "@packages/shared";
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
    const inputAmountDecimal = new Big(req.inputAmount);
    const inputAmountRaw = multiplyByPowerOfTen(inputAmountDecimal, eurTokenDecimals).toFixed(0, 0);
    const moneriumFee = Big(0);
    const outputAmountDecimal = inputAmountDecimal.minus(moneriumFee);
    const outputAmountRaw = multiplyByPowerOfTen(outputAmountDecimal, eurTokenDecimals).toFixed(0, 0);

    ctx.moneriumMint = {
      currency: ctx.request.inputCurrency,
      fee: moneriumFee,
      inputAmountDecimal: inputAmountDecimal,
      inputAmountRaw: inputAmountRaw,
      outputAmountDecimal,
      outputAmountRaw
    };

    ctx.addNote?.(
      `Initialized: ${inputAmountDecimal.toString()} ${req.inputCurrency} -> ${outputAmountDecimal.toString()} ${req.outputCurrency} (fee: ${moneriumFee.toString()})`
    );
  }
}
