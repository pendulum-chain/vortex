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
 * - Scope: BUY (on-ramp) to AssetHub/EVM and SELL (off-ramp) to PIX/SEPA/CBU.
 * - Computes final net output using ctx.preNabla, ctx.nabla/ctx.bridge (gross), and ctx.fees (display+USD).
 * - Applies discount metadata, validates, persists a QuoteTicket, and builds a QuoteResponse on ctx.builtResponse.
 */
export class FinalizeEngine implements Stage {
  readonly key = StageKey.Finalize;

  private price = new PriceFeedAdapter();
  private mapper = new QuoteMapper();
  private persistence = new PersistenceAdapter();

  async execute(ctx: QuoteContext): Promise<void> {
    const req = ctx.request;

    if (!ctx.nabla?.outputAmountDecimal) {
      throw new APIError({ message: "FinalizeEngine requires Nabla output", status: httpStatus.INTERNAL_SERVER_ERROR });
    }
    if (!ctx.fees?.displayFiat?.structure || !ctx.fees?.usd) {
      throw new APIError({ message: "FinalizeEngine requires computed fees", status: httpStatus.INTERNAL_SERVER_ERROR });
    }
    if (!ctx.preNabla?.deductibleFeeAmount || !ctx.preNabla?.feeCurrency) {
      throw new APIError({ message: "FinalizeEngine requires pre-Nabla fee data", status: httpStatus.INTERNAL_SERVER_ERROR });
    }

    // 1) Determine final gross output
    let finalGrossOutputAmountDecimal: Big;
    if (req.rampType === RampDirection.BUY) {
      // BUY: AssetHub uses Nabla output; EVM uses bridge final gross
      if (req.to === "assethub") {
        finalGrossOutputAmountDecimal = new Big(ctx.nabla!.outputAmountDecimal);
      } else {
        if (!ctx.bridge?.finalGrossOutputAmountDecimal) {
          throw new APIError({ message: "FinalizeEngine requires bridge output", status: httpStatus.INTERNAL_SERVER_ERROR });
        }
        finalGrossOutputAmountDecimal = new Big(ctx.bridge.finalGrossOutputAmountDecimal);
      }
    } else {
      // SELL: gross is Nabla output (fiat-representative)
      finalGrossOutputAmountDecimal = new Big(ctx.nabla!.outputAmountDecimal);
    }

    // 2) Fees in display fiat
    const display = ctx.fees.displayFiat!;
    const totalFeeFiat = new Big(display.structure.vortex)
      .plus(display.structure.anchor)
      .plus(display.structure.partnerMarkup)
      .plus(display.structure.network || "0");

    // 3) Avoid double-deducting pre-Nabla: subtract preNabla (converted to display fiat) from total fee
    const preNablaInDisplayFiat = await this.price.convertCurrency(
      ctx.preNabla.deductibleFeeAmount!.toString(),
      ctx.preNabla.feeCurrency as any,
      display.currency as any
    );
    const adjustedTotalFeeFiat = totalFeeFiat.minus(preNablaInDisplayFiat);

    // 4) Compute final net
    let finalNetOutputAmount: Big;
    if (req.rampType === RampDirection.BUY) {
      if (req.to === "assethub") {
        const totalFeeInOutputCurrency = await this.price.convertCurrency(
          adjustedTotalFeeFiat.toString(),
          display.currency as any,
          req.outputCurrency as any
        );
        finalNetOutputAmount = finalGrossOutputAmountDecimal.minus(totalFeeInOutputCurrency);
      } else {
        // EVM on-ramp: fees already deducted in bridge stage
        finalNetOutputAmount = finalGrossOutputAmountDecimal;
      }
    } else {
      // SELL: convert adjusted fee to output fiat (e.g., BRL/EURC/ARS) and subtract
      const totalFeeInOutputFiat = await this.price.convertCurrency(
        adjustedTotalFeeFiat.toString(),
        display.currency as any,
        req.outputCurrency as any
      );
      finalNetOutputAmount = finalGrossOutputAmountDecimal.minus(totalFeeInOutputFiat);
    }

    if (finalNetOutputAmount.lte(0)) {
      throw new APIError({
        message: "Input amount too low to cover calculated fees",
        status: httpStatus.BAD_REQUEST
      });
    }

    // 5) Validations
    if (req.rampType === RampDirection.BUY) {
      validateAmountLimits(req.inputAmount, req.inputCurrency as FiatToken, "min", req.rampType);
    } else {
      validateAmountLimits(finalNetOutputAmount, req.outputCurrency as FiatToken, "min", req.rampType);
    }

    // 6) Discount subsidy (metadata only; parity: add to net)
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

    // 7) Persistence structures
    const feeToStore = display.structure; // target display fiat
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

    const onrampOutputAmountMoonbeamRaw = ctx.bridge?.outputAmountMoonbeamRaw ?? "0";
    const outputAmountStr =
      req.rampType === RampDirection.BUY ? finalNetOutputAmount.toFixed(6, 0) : finalNetOutputAmount.toFixed(2, 0);

    const { record } = await this.persistence.createQuote({
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

    // 8) Build response
    const response = this.mapper.buildResponse({
      feeDisplay: feeToStore,
      outputAmountDecimalString: outputAmountStr,
      ticket: record
    });

    ctx.builtResponse = response;
    ctx.addNote?.("FinalizeEngine: persisted quote and built response");
  }
}
