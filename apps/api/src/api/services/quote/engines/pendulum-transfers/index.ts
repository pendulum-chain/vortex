import { RampCurrency, RampDirection } from "@packages/shared";
import Big from "big.js";
import { priceFeedService } from "../../../priceFeed.service";
import { QuoteContext, Stage, StageKey, XcmMeta } from "../../core/types";

export interface PendulumTransferConfig {
  direction: RampDirection;
  skipNote: string;
}

export interface StellarData {
  amountIn: Big;
  amountInRaw: string;
  amountOut: Big;
  amountOutRaw: string;
  fee: Big;
  currency: RampCurrency;
}

export interface PendulumTransferComputation {
  type: "xcm" | "stellar";
  data: XcmMeta | StellarData;
}

export abstract class BasePendulumTransferEngine implements Stage {
  abstract readonly config: PendulumTransferConfig;

  readonly key = StageKey.PendulumTransfer;

  protected abstract validate(ctx: QuoteContext): void;

  protected abstract compute(ctx: QuoteContext): Promise<PendulumTransferComputation>;

  protected abstract assign(ctx: QuoteContext, computation: PendulumTransferComputation): void;

  async execute(ctx: QuoteContext): Promise<void> {
    const { request } = ctx;
    const { direction, skipNote } = this.config;

    if (request.rampType !== direction) {
      ctx.addNote?.(skipNote);
      return;
    }

    this.validate(ctx);

    const computation = await this.compute(ctx);

    this.assign(ctx, computation);

    this.addNote(ctx, computation);
  }

  private addNote(ctx: QuoteContext, computation: PendulumTransferComputation): void {
    if (computation.type === "xcm") {
      const xcmData = computation.data as XcmMeta;
      ctx.addNote?.(
        `Calculated XCM transfer with ${xcmData.xcmFees.origin.amount} ${xcmData.xcmFees.origin.currency} origin fee and ${xcmData.xcmFees.destination.amount} ${xcmData.xcmFees.destination.currency} destination fee`
      );
    } else {
      const stellarData = computation.data as StellarData;
      ctx.addNote?.(`Calculated Stellar transfer with amount ${stellarData.amountIn.toString()} ${stellarData.currency}`);
    }
  }

  protected createXcmFees(ctx: QuoteContext): {
    origin: { amount: string; amountRaw: string; currency: string };
    destination: { amount: string; amountRaw: string; currency: string };
  } {
    // We currently can't really estimate XCM fees on Pendulum because we don't have the dry-run API available.
    return {
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
  }

  protected mergeSubsidy(ctx: QuoteContext, outputAmountDecimal: Big): Big {
    // biome-ignore lint/style/noNonNullAssertion: Context is validated in validate
    return outputAmountDecimal.plus(ctx.subsidy!.subsidyAmountInOutputToken);
  }

  protected mergeSubsidyRaw(ctx: QuoteContext, outputAmountRaw: Big): Big {
    // biome-ignore lint/style/noNonNullAssertion: Context is validated in validate
    return outputAmountRaw.plus(ctx.subsidy!.subsidyAmountInOutputTokenRaw);
  }
}
