/**
 * Input Planner Engine (Stage)
 * Computes pre-Nabla deductible fees and inputAmountForSwap for both BUY (on-ramp) and SELL (off-ramp).
 * Uses DB-backed logic from quote-fees.ts and price conversions from priceFeedService.
 */

import {
  EvmToken,
  getNetworkFromDestination,
  getPendulumDetails,
  Networks,
  OnChainToken,
  RampDirection
} from "@packages/shared";
import Big from "big.js";
import httpStatus from "http-status";
import { APIError } from "../../../../errors/api-error";
import { PriceFeedAdapter } from "../adapters/price-feed-adapter";
import { getEvmBridgeQuote } from "../gross-output";
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

    // 3) Compute inputAmountForSwap
    // - BUY and SELL from AssetHub: deduct fees from input amount directly
    // - SELL from non-AssetHub: adjust input based on Squidrouter bridge quote to Moonbeam axlUSDC before deducting
    let inputAmountForSwap: Big;

    if (req.rampType === RampDirection.SELL && req.from !== Networks.AssetHub) {
      const bridgeQuote = await getEvmBridgeQuote({
        amountDecimal: typeof req.inputAmount === "string" ? req.inputAmount : String(req.inputAmount),
        fromNetwork: req.from as Networks,
        inputCurrency: req.inputCurrency as OnChainToken,
        outputCurrency: EvmToken.AXLUSDC as unknown as OnChainToken,
        rampType: req.rampType,
        toNetwork: Networks.Moonbeam
      });
      inputAmountForSwap = new Big(bridgeQuote.outputAmountDecimal).minus(preNablaFeeInRepInput);
    } else {
      inputAmountForSwap = new Big(req.inputAmount).minus(preNablaFeeInRepInput);
    }

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
