import { EvmToken, RampCurrency, RampDirection } from "@packages/shared";
import Big from "big.js";
import { priceFeedService } from "../../../priceFeed.service";
import { calculateFeeComponents } from "../../core/quote-fees";
import { QuoteContext, Stage, StageKey } from "../../core/types";

export interface FeeComponentInput {
  amount: string;
  currency: RampCurrency;
}

export interface FeeSummaryInput {
  vortex: FeeComponentInput;
  anchor: FeeComponentInput;
  partnerMarkup: FeeComponentInput;
  network?: FeeComponentInput;
}

export interface FeeConfig {
  direction: RampDirection;
  skipNote: string;
}

export interface FeeComputation {
  anchor: FeeComponentInput;
  network: FeeComponentInput;
}

export abstract class BaseFeeEngine implements Stage {
  abstract readonly config: FeeConfig;

  readonly key = StageKey.Fee;

  async execute(ctx: QuoteContext): Promise<void> {
    const { request } = ctx;
    const { direction, skipNote } = this.config;

    if (request.rampType !== direction) {
      ctx.addNote?.(skipNote);
      return;
    }

    this.validate(ctx);

    const { anchorFee, feeCurrency, partnerMarkupFee, vortexFee } = await calculateFeeComponents({
      from: request.from,
      inputAmount: request.inputAmount,
      inputCurrency: request.inputCurrency,
      outputAmountOfframp: ctx.nablaSwap?.outputAmountDecimal?.toString() ?? "0",
      outputCurrency: request.outputCurrency,
      partnerName: ctx.partner?.id || undefined,
      rampType: request.rampType,
      to: request.to
    });

    const { anchor, network } = await this.compute(ctx, anchorFee, feeCurrency);

    await assignFeeSummary(ctx, {
      anchor,
      network,
      partnerMarkup: { amount: partnerMarkupFee, currency: feeCurrency },
      vortex: { amount: vortexFee, currency: feeCurrency }
    });
  }

  protected abstract validate(ctx: QuoteContext): void;

  protected abstract compute(ctx: QuoteContext, anchorFee: string, feeCurrency: RampCurrency): Promise<FeeComputation>;
}

/**
 * Assigns the normalized fee summary (USD + display currency) to the quote context.
 * Converts every component into both USD and the target display currency, and logs a standard note.
 */
export async function assignFeeSummary(ctx: QuoteContext, components: FeeSummaryInput): Promise<void> {
  const USD_CURRENCY = EvmToken.USDC as RampCurrency;
  const networkComponent = components.network ?? { amount: "0", currency: USD_CURRENCY };

  const convert = (amount: string, from: RampCurrency, to: RampCurrency) => priceFeedService.convertCurrency(amount, from, to);

  const [vortexUsd, anchorUsd, partnerUsd, networkUsd, vortexDisplay, anchorDisplay, partnerDisplay, networkDisplay] =
    await Promise.all([
      convert(components.vortex.amount, components.vortex.currency, USD_CURRENCY),
      convert(components.anchor.amount, components.anchor.currency, USD_CURRENCY),
      convert(components.partnerMarkup.amount, components.partnerMarkup.currency, USD_CURRENCY),
      convert(networkComponent.amount, networkComponent.currency, USD_CURRENCY),
      convert(components.vortex.amount, components.vortex.currency, ctx.targetFeeFiatCurrency),
      convert(components.anchor.amount, components.anchor.currency, ctx.targetFeeFiatCurrency),
      convert(components.partnerMarkup.amount, components.partnerMarkup.currency, ctx.targetFeeFiatCurrency),
      convert(networkComponent.amount, networkComponent.currency, ctx.targetFeeFiatCurrency)
    ]);

  const totalUsd = new Big(vortexUsd).plus(anchorUsd).plus(partnerUsd).plus(networkUsd).toFixed(6);
  const totalDisplay = new Big(vortexDisplay).plus(anchorDisplay).plus(partnerDisplay).plus(networkDisplay).toFixed(2);

  ctx.fees = {
    displayFiat: {
      anchor: anchorDisplay,
      currency: ctx.targetFeeFiatCurrency,
      network: networkDisplay,
      partnerMarkup: partnerDisplay,
      total: totalDisplay,
      vortex: vortexDisplay
    },
    usd: {
      anchor: anchorUsd,
      network: networkUsd,
      partnerMarkup: partnerUsd,
      total: totalUsd,
      vortex: vortexUsd
    }
  };

  const note = `Fees: usd[vortex=${ctx.fees.usd?.vortex ?? "0"}, anchor=${ctx.fees.usd?.anchor ?? "0"}, partner=${ctx.fees.usd?.partnerMarkup ?? "0"}, network=${ctx.fees.usd?.network ?? "0"}] display=${ctx.targetFeeFiatCurrency}`;
  ctx.addNote?.(note);
}
