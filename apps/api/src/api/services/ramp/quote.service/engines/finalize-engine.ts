import { EvmToken, FiatToken, RampDirection } from "@packages/shared";
import Big from "big.js";
import httpStatus from "http-status";
import { APIError } from "../../../../errors/api-error";
import { PersistenceAdapter } from "../adapters/persistence-adapter";
import { PriceFeedAdapter } from "../adapters/price-feed-adapter";
import { QuoteMapper } from "../mappers/quote-mapper";
import { QuoteContext, Stage, StageKey } from "../types";
import { validateAmountLimits } from "../validation-helpers";

/**
 * FinalizeEngine
 * - Scope: On-ramp to AssetHub path
 * - Computes final net output using ctx.preNabla (pre fees), ctx.nabla (gross), and ctx.fees (display+USD).
 * - Applies discount metadata to net amount for parity.
 * - Validates limits, persists a QuoteTicket, and builds a QuoteResponse on ctx.builtResponse.
 */
export class FinalizeEngine implements Stage {
  readonly key = StageKey.Finalize;

  private price = new PriceFeedAdapter();
  private mapper = new QuoteMapper();
  private persistence = new PersistenceAdapter();

  async execute(ctx: QuoteContext): Promise<void> {
    const req = ctx.request;

    // Only handle on-ramp to AssetHub in
    if (!(ctx.isOnRamp && req.to === "assethub")) {
      ctx.addNote?.("FinalizeEngine: skipped (not on-ramp to AssetHub)");
      return;
    }

    if (!ctx.nabla?.outputAmountDecimal) {
      throw new APIError({ message: "FinalizeEngine requires Nabla output", status: httpStatus.INTERNAL_SERVER_ERROR });
    }
    if (!ctx.fees?.displayFiat?.structure || !ctx.fees?.usd) {
      throw new APIError({ message: "FinalizeEngine requires computed fees", status: httpStatus.INTERNAL_SERVER_ERROR });
    }
    if (!ctx.preNabla?.deductibleFeeAmount || !ctx.preNabla?.feeCurrency) {
      throw new APIError({ message: "FinalizeEngine requires pre-Nabla fee data", status: httpStatus.INTERNAL_SERVER_ERROR });
    }

    // 1) Final gross (in output currency units on AssetHub)
    const finalGrossOutputAmountDecimal = new Big(ctx.nabla.outputAmountDecimal);

    // 2) Total fee in display fiat (vortex + anchor + partner) — network remains 0 here
    const display = ctx.fees.displayFiat!;
    const totalFeeFiat = new Big(display.structure.vortex).plus(display.structure.anchor).plus(display.structure.partnerMarkup);

    // 3) Avoid double-deducting pre-Nabla: subtract preNabla amount from total fee after converting it into display fiat.
    const preNablaInDisplayFiat = await this.price.convertCurrency(
      ctx.preNabla.deductibleFeeAmount!.toString(),
      ctx.preNabla.feeCurrency as any,
      display.currency as any
    );
    const adjustedTotalFeeFiat = totalFeeFiat.minus(preNablaInDisplayFiat);

    // Convert adjusted total fees to output currency and subtract from gross.
    const totalFeeInOutputCurrency = await this.price.convertCurrency(
      adjustedTotalFeeFiat.toString(),
      display.currency as any,
      req.outputCurrency as any
    );
    let finalNetOutputAmount = finalGrossOutputAmountDecimal.minus(totalFeeInOutputCurrency);

    if (finalNetOutputAmount.lte(0)) {
      throw new APIError({
        message: "Input amount too low to cover calculated fees",
        status: httpStatus.BAD_REQUEST
      });
    }

    // 4) Validations (BUY: ensure min input limits)
    if (req.rampType === RampDirection.BUY) {
      validateAmountLimits(req.inputAmount, req.inputCurrency as FiatToken, "min", req.rampType);
    }

    // 5) Discount subsidy (metadata only; parity: add to net)
    let discountSubsidyAmount = new Big(0);
    let discountInfo: { partnerId?: string; discount?: string; subsidyAmountInOutputToken?: string } | undefined;

    if (ctx.discount?.applied && ctx.discount.rate) {
      const rate = new Big(ctx.discount.rate);
      discountSubsidyAmount = finalNetOutputAmount.mul(rate);
      finalNetOutputAmount = finalNetOutputAmount.plus(discountSubsidyAmount);

      discountInfo = {
        discount: rate.toString(),
        partnerId: ctx.discount.partnerId,
        subsidyAmountInOutputToken: discountSubsidyAmount.toFixed(6, 0)
      };
    }

    // 6) Prepare persistence
    const feeToStore = display.structure; // already in target display fiat
    const usdFeeStructure = {
      anchor: ctx.fees.usd!.anchor,
      currency: EvmToken.USDC,
      network: ctx.fees.usd!.network,
      partnerMarkup: ctx.fees.usd!.partnerMarkup,
      total: ctx.fees.usd!.total,
      vortex: ctx.fees.usd!.vortex
    };

    const inputAmountForNablaSwapDecimal =
      ctx.preNabla.inputAmountForSwap?.toString() ??
      (typeof req.inputAmount === "string" ? req.inputAmount : String(req.inputAmount));

    // AssetHub on-ramp: no Moonbeam leg
    const onrampOutputAmountMoonbeamRaw = "0";
    const outputAmountStr = finalNetOutputAmount.toFixed(6, 0);

    const { id, expiresAt, record } = await this.persistence.createQuote({
      discount: discountInfo,
      feeDisplay: feeToStore,
      inputAmountForNablaSwapDecimal,
      onrampOutputAmountMoonbeamRaw,
      outputAmountDecimalString: outputAmountStr,
      partnerId: ctx.partner?.id || null,
      request: {
        from: req.from,
        inputAmount: typeof req.inputAmount === "string" ? req.inputAmount : String(req.inputAmount),
        inputCurrency: req.inputCurrency,
        outputCurrency: req.outputCurrency,
        rampType: req.rampType,
        to: req.to
      },
      usdFeeStructure
    });

    // 7) Build response and set on context
    const response = this.mapper.buildResponse({
      feeDisplay: feeToStore,
      outputAmountDecimalString: outputAmountStr,
      ticket: record
    });

    ctx.builtResponse = response;
    ctx.addNote?.("FinalizeEngine: persisted quote and built response (AssetHub on-ramp)");
  }
}
