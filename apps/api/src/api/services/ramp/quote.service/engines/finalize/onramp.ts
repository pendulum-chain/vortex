import { AssetHubToken, FiatToken, RampCurrency, RampDirection } from "@packages/shared";
import Big from "big.js";
import httpStatus from "http-status";
import QuoteTicket from "../../../../../../models/quoteTicket.model";
import { APIError } from "../../../../../errors/api-error";
import { priceFeedService } from "../../../../priceFeed.service";
import { trimTrailingZeros } from "../../core/helpers";
import { QuoteContext, Stage, StageKey } from "../../core/types";
import { validateAmountLimits } from "../../core/validation-helpers";

export class OnRampFinalizeEngine implements Stage {
  readonly key = StageKey.OnRampFinalize;

  private price = priceFeedService;

  async execute(ctx: QuoteContext): Promise<void> {
    const req = ctx.request;

    if (req.rampType !== RampDirection.BUY) {
      ctx.addNote?.("OnRampFinalizeEngine: skipped for off-ramp request");
      return;
    }

    if (!ctx.nabla?.outputAmountDecimal) {
      throw new APIError({ message: "OnRampFinalizeEngine requires Nabla output", status: httpStatus.INTERNAL_SERVER_ERROR });
    }
    if (!ctx.fees?.displayFiat?.total || !ctx.fees?.usd) {
      throw new APIError({ message: "OnRampFinalizeEngine requires computed fees", status: httpStatus.INTERNAL_SERVER_ERROR });
    }
    if (!ctx.preNabla?.deductibleFeeAmount || !ctx.preNabla?.feeCurrency) {
      throw new APIError({
        message: "OnRampFinalizeEngine requires pre-Nabla fee data",
        status: httpStatus.INTERNAL_SERVER_ERROR
      });
    }

    console.log("In finalize engine", ctx);

    let finalOutputAmountDecimal: Big;
    if (req.to === "assethub") {
      if (req.outputCurrency === AssetHubToken.USDC) {
        finalOutputAmountDecimal = new Big(ctx.nabla.outputAmountDecimal);
      } else {
        if (!ctx.hydration) {
          throw new APIError({
            message: "OnRampFinalizeEngine requires hydration output for AssetHub non-USDC",
            status: httpStatus.INTERNAL_SERVER_ERROR
          });
        }
        // Calculate gross output after subtracting XCM fees
        const originFeeInTargetCurrency = await this.price.convertCurrency(
          ctx.hydration.xcmFees.origin.amount,
          ctx.hydration.xcmFees.origin.currency as RampCurrency,
          req.outputCurrency
        );
        const destinationFeeInTargetCurrency = await this.price.convertCurrency(
          ctx.hydration.xcmFees.destination.amount,
          ctx.hydration.xcmFees.destination.currency as RampCurrency,
          req.outputCurrency
        );
        console.log("After price conversion in finalize", { destinationFeeInTargetCurrency, originFeeInTargetCurrency });
        finalOutputAmountDecimal = new Big(ctx.hydration.amountOut)
          .minus(originFeeInTargetCurrency)
          .minus(destinationFeeInTargetCurrency);

        console.log("Final output amount decimal", finalOutputAmountDecimal.toString());
      }
    } else {
      // EVM on-ramp with squidrouter as last step
      if (!ctx.bridge?.outputAmountDecimal) {
        throw new APIError({
          message: "OnRampFinalizeEngine requires bridge output for EVM",
          status: httpStatus.INTERNAL_SERVER_ERROR
        });
      }
      finalOutputAmountDecimal = new Big(ctx.bridge.outputAmountDecimal);
    }

    if (finalOutputAmountDecimal.lte(0)) {
      throw new APIError({
        message: "Input amount too low to cover calculated fees",
        status: httpStatus.BAD_REQUEST
      });
    }

    validateAmountLimits(req.inputAmount, req.inputCurrency as FiatToken, "min", req.rampType);

    let discountSubsidyAmount = new Big(0);

    if (ctx.subsidy?.applied && ctx.subsidy.rate) {
      const rate = new Big(ctx.subsidy.rate);
      discountSubsidyAmount = finalOutputAmountDecimal.mul(rate);
      finalOutputAmountDecimal = finalOutputAmountDecimal.plus(discountSubsidyAmount);

      ctx.subsidy.subsidyAmountInOutputToken = discountSubsidyAmount.toFixed(6, 0);
    }

    const outputAmountStr = finalOutputAmountDecimal.toFixed(6, 0);

    const record = await QuoteTicket.create({
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      fee: ctx.fees.displayFiat,
      from: req.from,
      inputAmount: req.inputAmount,
      inputCurrency: req.inputCurrency,
      metadata: ctx,
      outputAmount: outputAmountStr,
      outputCurrency: req.outputCurrency,
      partnerId: ctx.partner?.id || null,
      rampType: req.rampType,
      status: "pending",
      to: req.to
    });

    ctx.builtResponse = {
      expiresAt: record.expiresAt,
      fee: ctx.fees.displayFiat,
      from: record.from,
      id: record.id,
      inputAmount: trimTrailingZeros(record.inputAmount),
      inputCurrency: record.inputCurrency,
      outputAmount: trimTrailingZeros(outputAmountStr),
      outputCurrency: record.outputCurrency,
      rampType: record.rampType,
      to: record.to
    };

    ctx.addNote?.("OnRampFinalizeEngine: persisted quote and built response");
  }
}
