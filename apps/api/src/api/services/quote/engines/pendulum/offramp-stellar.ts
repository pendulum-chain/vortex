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

export class OnRampPendulumTransferEngine implements Stage {
  readonly key = StageKey.OffRampPendulumTransfer;

  private price = priceFeedService;

  async execute(ctx: QuoteContext): Promise<void> {
    const req = ctx.request;

    if (req.rampType !== RampDirection.SELL) {
      ctx.addNote?.("Skipped for off-ramp request");
      return;
    }

    if (
      !ctx.nablaSwap?.outputAmountDecimal ||
      !ctx.nablaSwap?.outputCurrency ||
      !ctx.nablaSwap?.outputAmountRaw ||
      !ctx.nablaSwap?.outputDecimals
    ) {
      throw new Error("OnRampPendulumTransferEngine requires nablaSwap in context");
    }

    // TODO
    // ctx.pendulumToStellar = { ... }

    ctx.addNote?.(``);
  }
}
