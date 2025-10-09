import { AssetHubToken, FiatToken, RampDirection } from "@packages/shared";
import Big from "big.js";
import httpStatus from "http-status";
import { APIError } from "../../../../errors/api-error";
import { QuoteContext } from "../../core/types";
import { validateAmountLimits } from "../../core/validation-helpers";
import { BaseFinalizeEngine, FinalizeComputation } from ".";

export class OnRampFinalizeEngine extends BaseFinalizeEngine {
  readonly config = {
    direction: RampDirection.BUY,
    missingFeesMessage: "OnRampFinalizeEngine requires displayFiat",
    skipNote: "Skipped for off-ramp request"
  } as const;

  protected async computeOutput(ctx: QuoteContext): Promise<FinalizeComputation> {
    const { request } = ctx;

    let finalOutputAmountDecimal: Big;
    if (request.to === "assethub") {
      if (request.outputCurrency === AssetHubToken.USDC) {
        const output = ctx.pendulumToAssethubXcm?.outputAmountDecimal;
        if (!output) {
          throw new APIError({
            message: "OnRampFinalizeEngine requires pendulumToAssethubXcm output for AssetHub non-USDC",
            status: httpStatus.INTERNAL_SERVER_ERROR
          });
        }
        finalOutputAmountDecimal = new Big(output);
      } else {
        const output = ctx.hydrationToAssethubXcm?.outputAmountDecimal;
        if (!output) {
          throw new APIError({
            message: "OnRampFinalizeEngine requires hydrationToAssethubXcm output for AssetHub non-USDC",
            status: httpStatus.INTERNAL_SERVER_ERROR
          });
        }
        finalOutputAmountDecimal = output;
      }
    } else if (request.inputCurrency === FiatToken.EURC) {
      const output = ctx.evmToEvm?.outputAmountDecimal;
      if (!output) {
        throw new APIError({
          message: "OnRampFinalizeEngine requires bridge output for EVM",
          status: httpStatus.INTERNAL_SERVER_ERROR
        });
      }
      finalOutputAmountDecimal = new Big(output);
    } else {
      const output = ctx.moonbeamToEvm?.outputAmountDecimal;
      if (!output) {
        throw new APIError({
          message: "OnRampFinalizeEngine requires bridge output for EVM",
          status: httpStatus.INTERNAL_SERVER_ERROR
        });
      }
      finalOutputAmountDecimal = new Big(output);
    }

    if (finalOutputAmountDecimal.lte(0)) {
      throw new APIError({
        message: "Input amount too low to cover calculated fees",
        status: httpStatus.BAD_REQUEST
      });
    }

    return {
      amount: finalOutputAmountDecimal,
      decimals: 6
    };
  }

  protected validate(ctx: QuoteContext, { amount }: FinalizeComputation): void {
    validateAmountLimits(ctx.request.inputAmount, ctx.request.inputCurrency as FiatToken, "min", ctx.request.rampType);
    validateAmountLimits(amount, ctx.request.outputCurrency as FiatToken, "min", ctx.request.rampType);
  }
}
