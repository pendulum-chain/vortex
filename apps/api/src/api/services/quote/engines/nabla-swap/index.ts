import {
  AssetHubToken,
  FiatToken,
  getPendulumDetails,
  Networks,
  PENDULUM_USDC_AXL,
  PendulumTokenDetails,
  RampDirection
} from "@packages/shared";
import { Big } from "big.js";
import { calculateNablaSwapOutput } from "../../core/nabla";
import { QuoteContext, Stage, StageKey } from "../../core/types";
import { validateAmountLimits } from "../../core/validation-helpers";

export interface NablaSwapConfig {
  direction: RampDirection;
  skipNote: string;
}

export interface NablaSwapComputation {
  inputAmountPreFees: Big;
  inputTokenPendulumDetails: PendulumTokenDetails;
  outputTokenPendulumDetails: PendulumTokenDetails;
}

export abstract class BaseNablaSwapEngine implements Stage {
  abstract readonly config: NablaSwapConfig;

  readonly key = StageKey.NablaSwap;

  protected abstract validate(ctx: QuoteContext): void;

  protected abstract compute(ctx: QuoteContext): NablaSwapComputation;

  async execute(ctx: QuoteContext): Promise<void> {
    const { request } = ctx;
    const { direction, skipNote } = this.config;

    if (request.rampType !== direction) {
      ctx.addNote?.(skipNote);
      return;
    }

    this.validate(ctx);

    const { inputAmountPreFees, inputTokenPendulumDetails, outputTokenPendulumDetails } = this.compute(ctx);

    const deductibleFeeAmount = this.getDeductibleFeeAmount(ctx);
    const inputAmountForSwap = inputAmountPreFees.minus(deductibleFeeAmount).toString();
    const inputAmountForSwapRaw = this.calculateInputAmountForSwapRaw(inputAmountForSwap, inputTokenPendulumDetails);

    const result = await calculateNablaSwapOutput({
      inputAmountForSwap,
      inputTokenPendulumDetails,
      outputTokenPendulumDetails,
      rampType: request.rampType
    });

    this.validateLimits(ctx, result);

    this.assignNablaSwapContext(
      ctx,
      result,
      inputAmountForSwap,
      inputAmountForSwapRaw,
      inputTokenPendulumDetails,
      outputTokenPendulumDetails
    );

    this.addNote(ctx, inputTokenPendulumDetails, outputTokenPendulumDetails, inputAmountForSwap, result);
  }

  private getDeductibleFeeAmount(ctx: QuoteContext): Big {
    if (ctx.request.rampType === RampDirection.SELL) {
      return ctx.preNabla?.deductibleFeeAmountInSwapCurrency || new Big(0);
    } else {
      return new Big(ctx.fees?.usd?.total || 0);
    }
  }

  private calculateInputAmountForSwapRaw(inputAmountForSwap: string, inputToken: PendulumTokenDetails): string {
    return new Big(inputAmountForSwap).times(new Big(10).pow(inputToken.decimals)).toFixed(0);
  }

  private validateLimits(ctx: QuoteContext, result: { nablaOutputAmountDecimal: Big }): void {
    if (ctx.request.rampType === RampDirection.SELL) {
      validateAmountLimits(
        result.nablaOutputAmountDecimal,
        ctx.request.outputCurrency as FiatToken,
        "max",
        ctx.request.rampType
      );
    }
  }

  private assignNablaSwapContext(
    ctx: QuoteContext,
    result: { effectiveExchangeRate?: string; nablaOutputAmountDecimal: Big; nablaOutputAmountRaw: string },
    inputAmountForSwapDecimal: string,
    inputAmountForSwapRaw: string,
    inputToken: PendulumTokenDetails,
    outputToken: PendulumTokenDetails
  ): void {
    ctx.nablaSwap = {
      ...ctx.nablaSwap,
      effectiveExchangeRate: result.effectiveExchangeRate,
      inputAmountForSwapDecimal,
      inputAmountForSwapRaw,
      inputCurrency: inputToken.currency,
      inputCurrencyId: inputToken.currencyId,
      inputDecimals: inputToken.decimals,
      inputToken: inputToken.erc20WrapperAddress,
      outputAmountDecimal: result.nablaOutputAmountDecimal,
      outputAmountRaw: result.nablaOutputAmountRaw,
      outputCurrency: outputToken.currency,
      outputCurrencyId: outputToken.currencyId,
      outputDecimals: outputToken.decimals,
      outputToken: outputToken.erc20WrapperAddress
    };
  }

  private addNote(
    ctx: QuoteContext,
    inputToken: PendulumTokenDetails,
    outputToken: PendulumTokenDetails,
    inputAmountForSwap: string,
    result: { nablaOutputAmountDecimal: Big }
  ): void {
    ctx.addNote?.(
      `Nabla swap from ${inputToken.currency} to ${outputToken.currency}, input amount ${inputAmountForSwap}, output amount ${result.nablaOutputAmountDecimal.toFixed()}`
    );
  }
}
