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
import { APIError } from "../../../../../errors/api-error";
import { priceFeedService } from "../../../../priceFeed.service";
import { getEvmBridgeQuote } from "../../gross-output";
import { calculatePreNablaDeductibleFees } from "../../quote-fees";
import { QuoteContext, Stage, StageKey } from "../../types";

export class OffRampInitializeEngine implements Stage {
  readonly key = StageKey.OffRampInitialize;

  private price = priceFeedService;

  async execute(ctx: QuoteContext): Promise<void> {
    const req = ctx.request;

    if (req.rampType !== RampDirection.SELL) {
      ctx.addNote?.("OffRampInputPlannerEngine: skipped for on-ramp request");
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

    let inputAmountForSwap: Big;

    if (req.from !== Networks.AssetHub) {
      const bridgeQuote = await getEvmBridgeQuote({
        amountDecimal: req.inputAmount,
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

    ctx.preNabla = {
      deductibleFeeAmount: new Big(preNablaDeductibleFeeAmount),
      feeCurrency,
      inputAmountForSwap,
      representativeInputCurrency: representativeCurrency
    };

    ctx.addNote?.(
      `OffRampInputPlannerEngine: fee=${preNablaDeductibleFeeAmount.toString()} ${feeCurrency}, rep=${representativeCurrency}, inputForSwap=${inputAmountForSwap.toString()}`
    );
  }
}
