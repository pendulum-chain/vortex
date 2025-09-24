import { getNetworkFromDestination, getPendulumDetails, RampDirection } from "@packages/shared";
import Big from "big.js";
import httpStatus from "http-status";
import { APIError } from "../../../../../errors/api-error";
import { priceFeedService } from "../../../../priceFeed.service";
import { calculatePreNablaDeductibleFees } from "../../quote-fees";
import { QuoteContext, Stage, StageKey } from "../../types";

export class OnRampInputPlannerEngine implements Stage {
  readonly key = StageKey.OnRampInputPlanner;

  private price = priceFeedService;

  async execute(ctx: QuoteContext): Promise<void> {
    const req = ctx.request;

    if (req.rampType !== RampDirection.BUY) {
      ctx.addNote?.("OnRampInputPlannerEngine: skipped for off-ramp request");
      return;
    }

    const { preNablaDeductibleFeeAmount, feeCurrency } = await calculatePreNablaDeductibleFees(
      req.inputAmount,
      req.inputCurrency,
      req.outputCurrency,
      req.rampType,
      req.from,
      req.to,
      ctx.partner?.id || undefined
    );

    const representativeCurrency = getPendulumDetails(req.inputCurrency, undefined).currency;
    const preNablaFeeInRepInput = await this.price.convertCurrency(
      preNablaDeductibleFeeAmount.toString(),
      feeCurrency,
      representativeCurrency
    );

    const inputAmountForSwap = new Big(req.inputAmount).minus(preNablaFeeInRepInput);

    if (inputAmountForSwap.lte(0)) {
      throw new APIError({
        message: "Input amount too low after deducting pre-Nabla fees",
        status: httpStatus.BAD_REQUEST
      });
    }

    ctx.preNabla = {
      deductibleFeeAmount: new Big(preNablaDeductibleFeeAmount),
      feeCurrency,
      inputAmountForSwap,
      representativeInputCurrency: representativeCurrency
    };

    ctx.addNote?.(
      `OnRampInputPlannerEngine: fee=${preNablaDeductibleFeeAmount.toString()} ${feeCurrency}, rep=${representativeCurrency}, inputForSwap=${inputAmountForSwap.toString()}`
    );
  }
}
