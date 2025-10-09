import { AssetHubToken, multiplyByPowerOfTen, RampCurrency, RampDirection } from "@packages/shared";
import Big from "big.js";
import { priceFeedService } from "../../../priceFeed.service";
import { QuoteContext, XcmMeta } from "../../core/types";
import { BasePendulumTransferEngine, PendulumTransferComputation, PendulumTransferConfig } from "./index";

export class OnRampPendulumTransferEngine extends BasePendulumTransferEngine {
  readonly config: PendulumTransferConfig = {
    direction: RampDirection.BUY,
    skipNote: "Skipped for off-ramp request"
  };

  private price = priceFeedService;

  protected validate(ctx: QuoteContext): void {
    if (!ctx.nablaSwap) {
      throw new Error("OnRampPendulumTransferEngine requires nablaSwap in context");
    }

    if (!ctx.subsidy) {
      throw new Error("OnRampPendulumTransferEngine requires subsidy in context");
    }
  }

  protected async compute(ctx: QuoteContext): Promise<PendulumTransferComputation> {
    // biome-ignore lint/style/noNonNullAssertion: Context is validated in validate
    const nablaSwap = ctx.nablaSwap!;
    const req = ctx.request;

    const hydrationDestinationFee = {
      amount: "0.15",
      amountRaw: "150000",
      currency: "USDC"
    };

    const assethubDestinationFee = {
      amount: "0.10",
      amountRaw: "100000",
      currency: "USDC"
    };

    const moonbeamDestinationFee = {
      amount: "0.15",
      amountRaw: "150000",
      currency: "USDC"
    };

    // We currently can't really estimate XCM fees on Pendulum because we don't have the dry-run API available.
    const xcmFees = {
      destination:
        req.to === "assethub"
          ? req.outputCurrency !== AssetHubToken.USDC
            ? hydrationDestinationFee
            : assethubDestinationFee
          : moonbeamDestinationFee,
      origin: {
        amount: "0.01",
        amountRaw: "10000",
        currency: "USDC"
      }
    };

    const originFeeInTargetCurrency = await this.price.convertCurrency(
      xcmFees.origin.amount,
      xcmFees.origin.currency as RampCurrency,
      req.outputCurrency
    );
    const destinationFeeInTargetCurrency = await this.price.convertCurrency(
      xcmFees.destination.amount,
      xcmFees.destination.currency as RampCurrency,
      req.outputCurrency
    );

    // FIXME only the Hydration transfer needs to deduct the fees like this.
    // For the other transfers, the fee is either paid in GLMR or DOT
    const outputAmountDecimal = this.mergeSubsidy(ctx, new Big(nablaSwap.outputAmountDecimal))
      .minus(originFeeInTargetCurrency)
      .minus(destinationFeeInTargetCurrency);
    const outputAmountRaw = multiplyByPowerOfTen(outputAmountDecimal, nablaSwap.outputDecimals).toString();

    const xcmMeta: XcmMeta = {
      fromToken: nablaSwap.outputCurrency,
      inputAmountDecimal: nablaSwap.outputAmountDecimal,
      inputAmountRaw: nablaSwap.outputAmountRaw,
      outputAmountDecimal,
      outputAmountRaw,
      toToken: nablaSwap.outputCurrency,
      xcmFees
    };

    return {
      data: xcmMeta,
      type: "xcm"
    };
  }

  protected assign(ctx: QuoteContext, computation: PendulumTransferComputation): void {
    const req = ctx.request;
    const xcmMeta = computation.data as XcmMeta;

    if (req.to === "assethub") {
      if (req.outputCurrency !== AssetHubToken.USDC) {
        // Transfer to Hydration first for non-USDC AssetHub tokens
        ctx.pendulumToHydrationXcm = xcmMeta;
      } else {
        // Direct transfer from Pendulum to AssetHub
        ctx.pendulumToAssethubXcm = xcmMeta;
      }
    } else {
      // Transfer from Pendulum to Moonbeam
      ctx.pendulumToMoonbeamXcm = xcmMeta;
    }
  }
}
