import { RampDirection } from "@packages/shared";
import Big from "big.js";
import httpStatus from "http-status";
import QuoteTicket from "../../../../../models/quoteTicket.model";
import { APIError } from "../../../../errors/api-error";
import { trimTrailingZeros } from "../../core/helpers";
import { QuoteContext, Stage, StageKey } from "../../core/types";

export interface FinalizeStageConfig {
  direction: RampDirection;
  skipNote: string;
  missingFeesMessage: string;
}

export interface FinalizeComputation {
  amount: Big;
  decimals: number;
}

export abstract class BaseFinalizeEngine implements Stage {
  abstract readonly config: FinalizeStageConfig;

  readonly key = StageKey.Finalize;

  protected abstract computeOutput(ctx: QuoteContext): Promise<FinalizeComputation>;

  protected validate(ctx: QuoteContext, result: FinalizeComputation): void {
    // Implemented by subclasses when necessary
  }

  async execute(ctx: QuoteContext): Promise<void> {
    const { request } = ctx;
    const { direction, skipNote, missingFeesMessage } = this.config;

    if (request.rampType !== direction) {
      ctx.addNote?.(skipNote);
      return;
    }

    if (!ctx.fees?.displayFiat) {
      throw new APIError({ message: missingFeesMessage, status: httpStatus.INTERNAL_SERVER_ERROR });
    }

    const computation = await this.computeOutput(ctx);
    this.validate(ctx, computation);

    const outputAmountStr = computation.amount.toFixed(computation.decimals, 0);

    const record = await QuoteTicket.create({
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      fee: ctx.fees.displayFiat,
      from: request.from,
      inputAmount: request.inputAmount,
      inputCurrency: request.inputCurrency,
      metadata: ctx,
      outputAmount: outputAmountStr,
      outputCurrency: request.outputCurrency,
      partnerId: ctx.partner?.id || null,
      rampType: request.rampType,
      status: "pending",
      to: request.to
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
