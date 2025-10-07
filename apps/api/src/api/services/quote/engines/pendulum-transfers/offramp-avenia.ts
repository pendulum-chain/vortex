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
import { calculateNablaSwapOutput } from "../../core/nabla";
import { getTokenDetailsForEvmDestination } from "../../core/squidrouter";
import { QuoteContext, Stage, StageKey, XcmMeta } from "../../core/types";

export class OffRampToAveniaPendulumTransferEngine implements Stage {
  readonly key = StageKey.OffRampPendulumTransfer;

  private price = priceFeedService;

  async execute(ctx: QuoteContext): Promise<void> {
    const req = ctx.request;

    if (req.rampType !== RampDirection.SELL) {
      ctx.addNote?.("Skipped for off-ramp request");
      return;
    }

    if (!ctx.nablaSwap) {
      throw new Error("OffRampToAveniaPendulumTransferEngine requires nablaSwap in context");
    }

    if (!ctx.subsidy) {
      throw new Error("OffRampToAveniaPendulumTransferEngine requires subsidy in context");
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

    // We don't need to deduct the XCM fees from the output amount because the fees are not paid in the token
    // being transferred but in GLMR
    const outputAmountDecimal = new Big(ctx.nablaSwap.outputAmountDecimal).plus(ctx.subsidy.subsidyAmountInOutputToken);
    const outputAmountRaw = multiplyByPowerOfTen(outputAmountDecimal, ctx.nablaSwap.outputDecimals).toString();

    ctx.pendulumToMoonbeamXcm = {
      fromToken: ctx.nablaSwap.outputCurrency,
      inputAmountDecimal: ctx.nablaSwap.outputAmountDecimal,
      inputAmountRaw: ctx.nablaSwap.outputAmountRaw,
      outputAmountDecimal,
      outputAmountRaw,
      toToken: ctx.nablaSwap.outputCurrency,
      xcmFees
    };

    ctx.addNote?.(
      `Calculated XCM transfer with ${xcmFees.origin.amount} ${xcmFees.origin.currency} origin fee and ${xcmFees.destination.amount} ${xcmFees.destination.currency} destination fee`
    );
  }
}
