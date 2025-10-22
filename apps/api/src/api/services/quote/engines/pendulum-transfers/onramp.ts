import { AssetHubToken, multiplyByPowerOfTen, Networks, RampCurrency, RampDirection } from "@packages/shared";
import Big from "big.js";
import { priceFeedService } from "../../../priceFeed.service";
import { QuoteContext, XcmMeta } from "../../core/types";
import { BasePendulumTransferEngine, PendulumTransferComputation, PendulumTransferConfig } from "./index";

export class OnRampPendulumTransferEngine extends BasePendulumTransferEngine {
  readonly config: PendulumTransferConfig = {
    direction: RampDirection.BUY,
    skipNote: "OnRampPendulumTransferEngine: Skipped because rampType is SELL, this engine handles BUY operations only"
  };

  private price = priceFeedService;

  protected validate(ctx: QuoteContext): void {
    if (!ctx.nablaSwap) {
      throw new Error("OnRampPendulumTransferEngine: Missing nablaSwap in context - ensure nabla-swap stage ran successfully");
    }

    if (!ctx.subsidy) {
      throw new Error("OnRampPendulumTransferEngine: Missing subsidy in context - ensure subsidy calculation ran successfully");
    }

    if (!ctx.fees?.usd || !ctx.fees?.displayFiat) {
      throw new Error("OnRampPendulumTransferEngine: Missing fees in context - ensure fee calculation ran successfully");
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
      amount: "0.018",
      amountRaw: "18000",
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
        req.to === Networks.AssetHub
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

    let outputAmountDecimal = this.mergeSubsidy(ctx, new Big(nablaSwap.outputAmountDecimal));
    if (req.to === Networks.AssetHub) {
      // Only the Hydration and Assethub transfer needs to deduct the fees like this.
      // For Moonbeam, the fee is either paid in GLMR
      outputAmountDecimal = outputAmountDecimal.minus(originFeeInTargetCurrency).minus(destinationFeeInTargetCurrency);

      // Adjust network fee in ctx
      const extraFeeUsd = Big(xcmFees.origin.amount).plus(xcmFees.destination.amount);
      const extraFeeFiat = Big(originFeeInTargetCurrency).plus(destinationFeeInTargetCurrency);

      // biome-ignore lint/style/noNonNullAssertion: Context is validated in validate
      const usdFees = ctx.fees!.usd!;
      usdFees.network = Big(usdFees.network).plus(extraFeeUsd).toString();
      usdFees.total = Big(usdFees.total).plus(extraFeeUsd).toFixed(2);

      // biome-ignore lint/style/noNonNullAssertion: Context is validated in validate
      const fiatFees = ctx.fees!.displayFiat!;
      fiatFees.network = Big(fiatFees.network).plus(extraFeeFiat).toString();
      fiatFees.total = Big(fiatFees.total).plus(extraFeeFiat).toFixed(2);
    }
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
