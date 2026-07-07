import { EvmToken, RampCurrency, RampDirection } from "@vortexfi/shared";
import Big from "big.js";
import { config } from "../../../../../config/vars";
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
  // Optional fees that may not be applicable to all engines, but can be included in the summary if present
  // Override the vortex and partner markup fees from the fee components
  forcedVortexFee?: FeeComponentInput;
  forcedPartnerMarkupFee?: FeeComponentInput;
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
      partnerId: ctx.partner?.id || undefined,
      rampType: request.rampType,
      to: request.to
    });

    const { anchor, network, forcedVortexFee, forcedPartnerMarkupFee } = await this.compute(ctx, anchorFee, feeCurrency);

    await assignFeeSummary(ctx, {
      anchor,
      network,
      partnerMarkup: forcedPartnerMarkupFee ? forcedPartnerMarkupFee : { amount: partnerMarkupFee, currency: feeCurrency },
      vortex: forcedVortexFee ? forcedVortexFee : { amount: vortexFee, currency: feeCurrency }
    });
  }

  protected abstract validate(ctx: QuoteContext): void;

  protected abstract compute(ctx: QuoteContext, anchorFee: string, feeCurrency: RampCurrency): Promise<FeeComputation>;
}

/**
 * Single source of truth for all fee representations on a quote.
 *
 * Produces both `fees.usd` (used for on-chain distribution) and `fees.displayFiat`
 * (used for user-facing display) from the same source components in a single atomic
 * operation. Both are persisted together inside `QuoteTicket.metadata.fees`.
 *
 * Do NOT assign `ctx.fees` outside this function.
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

  const vortexFeePenPercentage = config.vortexFeePenPercentage ?? 0;

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
    },
    vortexFeePenPercentage
  };

  const note = `Fees: usd[vortex=${ctx.fees.usd?.vortex ?? "0"}, anchor=${ctx.fees.usd?.anchor ?? "0"}, partner=${ctx.fees.usd?.partnerMarkup ?? "0"}, network=${ctx.fees.usd?.network ?? "0"}] display=${ctx.targetFeeFiatCurrency}`;
  ctx.addNote?.(note);
}
