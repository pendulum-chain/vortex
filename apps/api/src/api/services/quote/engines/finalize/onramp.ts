import { AssetHubToken, FiatToken, RampCurrency, RampDirection } from "@packages/shared";
import Big from "big.js";
import httpStatus from "http-status";
import QuoteTicket from "../../../../../models/quoteTicket.model";
import { APIError } from "../../../../errors/api-error";
import { priceFeedService } from "../../../priceFeed.service";
import { trimTrailingZeros } from "../../core/helpers";
import { QuoteContext, Stage, StageKey } from "../../core/types";
import { validateAmountLimits } from "../../core/validation-helpers";

export class OnRampFinalizeEngine implements Stage {
  readonly key = StageKey.Finalize;

  async execute(ctx: QuoteContext): Promise<void> {
    const req = ctx.request;

    if (req.rampType !== RampDirection.BUY) {
      ctx.addNote?.("Skipped for off-ramp request");
      return;
    }

    if (!ctx.fees?.displayFiat) {
      throw new APIError({ message: "OnRampFinalizeEngine requires displayFiat", status: httpStatus.INTERNAL_SERVER_ERROR });
    }

    let finalOutputAmountDecimal: Big;
    if (req.to === "assethub") {
      if (req.outputCurrency === AssetHubToken.USDC) {
        if (!ctx.pendulumToAssethubXcm?.outputAmountDecimal) {
          throw new APIError({
            message: "OnRampFinalizeEngine requires pendulumToAssethubXcm output for AssetHub non-USDC",
            status: httpStatus.INTERNAL_SERVER_ERROR
          });
        }
        finalOutputAmountDecimal = new Big(ctx.pendulumToAssethubXcm?.outputAmountDecimal);
      } else {
        if (!ctx.hydrationToAssethubXcm?.outputAmountDecimal) {
          throw new APIError({
            message: "OnRampFinalizeEngine requires hydrationToAssethubXcm output for AssetHub non-USDC",
            status: httpStatus.INTERNAL_SERVER_ERROR
          });
        }
        finalOutputAmountDecimal = ctx.hydrationToAssethubXcm.outputAmountDecimal;
      }
    } else {
      if (ctx.request.inputCurrency === FiatToken.EURC) {
        // EVM on-ramp from EVM to EVM (Monerium)
        if (!ctx.evmToEvm?.outputAmountDecimal) {
          throw new APIError({
            message: "OnRampFinalizeEngine requires bridge output for EVM",
            status: httpStatus.INTERNAL_SERVER_ERROR
          });
        }
        finalOutputAmountDecimal = new Big(ctx.evmToEvm.outputAmountDecimal);
      } else {
        // EVM on-ramp with squidrouter as last step
        if (!ctx.moonbeamToEvm?.outputAmountDecimal) {
          throw new APIError({
            message: "OnRampFinalizeEngine requires bridge output for EVM",
            status: httpStatus.INTERNAL_SERVER_ERROR
          });
        }
        finalOutputAmountDecimal = new Big(ctx.moonbeamToEvm.outputAmountDecimal);
      }
    }

    if (finalOutputAmountDecimal.lte(0)) {
      throw new APIError({
        message: "Input amount too low to cover calculated fees",
        status: httpStatus.BAD_REQUEST
      });
    }

    validateAmountLimits(req.inputAmount, req.inputCurrency as FiatToken, "min", req.rampType);

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

    ctx.addNote?.("Persisted quote and built response");
  }
}
