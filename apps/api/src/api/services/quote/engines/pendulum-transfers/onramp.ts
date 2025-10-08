import {
  AssetHubToken,
  EvmToken,
  multiplyByPowerOfTen,
  Networks,
  OnChainToken,
  RampCurrency,
  RampDirection
} from "@packages/shared";
import Big from "big.js";
import { priceFeedService } from "../../../priceFeed.service";
import { QuoteContext, Stage, StageKey, XcmMeta } from "../../core/types";

export class OnRampPendulumTransferEngine implements Stage {
  readonly key = StageKey.PendulumTransfer;

  private price = priceFeedService;

  async execute(ctx: QuoteContext): Promise<void> {
    const req = ctx.request;

    if (req.rampType !== RampDirection.BUY) {
      ctx.addNote?.("Skipped for off-ramp request");
      return;
    }

    if (!ctx.nablaSwap) {
      throw new Error("OnRampPendulumTransferEngine requires nablaSwap in context");
    }

    if (!ctx.subsidy) {
      throw new Error("OnRampPendulumTransferEngine requires subsidy in context");
    }

    // We currently can't really estimate XCM fees on Pendulum because we don't have the dry-run API available.
    const xcmFees = {
      destination: {
        amount: "0.01",
        amountRaw: "10000",
        currency: "USDC"
      },
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
    const outputAmountDecimal = new Big(ctx.nablaSwap.outputAmountDecimal)
      .plus(ctx.subsidy.subsidyAmountInOutputToken)
      .minus(originFeeInTargetCurrency)
      .minus(destinationFeeInTargetCurrency);
    const outputAmountRaw = multiplyByPowerOfTen(outputAmountDecimal, ctx.nablaSwap.outputDecimals).toString();

    const xcmMeta: XcmMeta = {
      fromToken: ctx.nablaSwap.outputCurrency,
      inputAmountDecimal: ctx.nablaSwap.outputAmountDecimal,
      inputAmountRaw: ctx.nablaSwap.outputAmountRaw,
      outputAmountDecimal,
      outputAmountRaw,
      toToken: ctx.nablaSwap.outputCurrency,
      xcmFees
    };

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

    ctx.addNote?.(
      `Calculated XCM transfer with ${xcmFees.origin.amount} ${xcmFees.origin.currency} origin fee and ${xcmFees.destination.amount} ${xcmFees.destination.currency} destination fee`
    );
  }
}
