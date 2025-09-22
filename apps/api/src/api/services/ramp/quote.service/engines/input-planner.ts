/**
 * Input Planner Engine (Stage)
 * Computes pre-Nabla deductible fees and inputAmountForSwap for BUY flows (on-ramp).
 * Uses DB-backed logic from quote-fees.ts and price conversions from priceFeedService.
 */

import { getNetworkFromDestination, getPendulumDetails } from "@packages/shared";
import Big from "big.js";
import httpStatus from "http-status";
import { APIError } from "../../../../errors/api-error";
import { PriceFeedAdapter } from "../adapters/price-feed-adapter";
import { calculatePreNablaDeductibleFees } from "../quote-fees";
import { QuoteContext, Stage, StageKey } from "../types";

export class InputPlannerEngine implements Stage {
  readonly key = StageKey.InputPlanner;

  private price = new PriceFeedAdapter();

  async execute(ctx: QuoteContext): Promise<void> {
    const req = ctx.request;

    // 1) Calculate pre-Nabla deductible fees (DB driven)
    const { preNablaDeductibleFeeAmount, feeCurrency } = await calculatePreNablaDeductibleFees(
      req.inputAmount,
      req.inputCurrency,
      req.outputCurrency,
      req.rampType,
      req.from,
      req.to,
      ctx.partner?.id || undefined
    );

    // 2) Convert pre-Nabla deductible fees to representative input currency on Pendulum
    const fromNetwork = getNetworkFromDestination(req.from);
    if (!fromNetwork) {
      throw new APIError({ message: `Invalid source network: ${req.from}`, status: httpStatus.BAD_REQUEST });
    }

    const representativeCurrency = getPendulumDetails(req.inputCurrency, fromNetwork).currency;
    const preNablaFeeInRepInput = await this.price.convertCurrency(
      preNablaDeductibleFeeAmount.toString(),
      feeCurrency,
      representativeCurrency
    );

    // 3) Compute inputAmountForSwap (BUY-focused path)
    const inputAmountForSwap = new Big(req.inputAmount).minus(preNablaFeeInRepInput);

    if (inputAmountForSwap.lte(0)) {
      throw new APIError({
        message: "Input amount too low after deducting pre-Nabla fees",
        status: httpStatus.BAD_REQUEST
      });
    }

    // Persist into context
    ctx.preNabla = {
      deductibleFeeAmount: new Big(preNablaDeductibleFeeAmount),
      feeCurrency,
      inputAmountForSwap,
      representativeInputCurrency: representativeCurrency
    };

    ctx.addNote?.(
      `InputPlannerEngine: fee=${preNablaDeductibleFeeAmount.toString()} ${feeCurrency}, rep=${representativeCurrency}, inputForSwap=${inputAmountForSwap.toString()}`
    );
  }
}
