import {
  ALFREDPAY_ERC20_DECIMALS,
  ALFREDPAY_ONCHAIN_CURRENCY,
  AlfredpayApiService,
  AlfredpayChain,
  AlfredpayFiatCurrency,
  AlfredpayPaymentMethodType,
  CreateAlfredpayOfframpQuoteRequest,
  multiplyByPowerOfTen,
  RampCurrency,
  RampDirection
} from "@vortexfi/shared";
import Big from "big.js";
import { priceFeedService } from "../../../priceFeed.service";
import { requireAlfredpayEffectiveUserId, resolveAlfredpayCustomerId } from "../../alfredpay-customer";
import { QuoteContext } from "../../core/types";
import { BaseInitializeEngine } from "./../initialize/index";

export class OfframpTransactionAlfredpayEngine extends BaseInitializeEngine {
  readonly config = {
    direction: RampDirection.SELL,
    skipNote: "OfframpTransactionAlfredpayEngine: Skipped because rampType is BUY, this engine handles SELL operations only"
  };

  protected async executeInternal(ctx: QuoteContext): Promise<void> {
    const req = ctx.request;
    const effectiveUserId = requireAlfredpayEffectiveUserId(req.userId);

    if (!ctx.evmToEvm) {
      throw new Error("OfframpTransactionAlfredpayEngine: No evmToEvm quote");
    }

    if (!ctx.subsidy) {
      throw new Error("OfframpTransactionAlfredpayEngine: Missing ctx.subsidy (Discount stage must run first)");
    }

    // Use the same oracle rate as Discount to back-solve the subsidized USD input.
    const oneUnitInFiat = await priceFeedService.convertCurrency(
      "1",
      ALFREDPAY_ONCHAIN_CURRENCY as unknown as RampCurrency,
      req.outputCurrency as RampCurrency
    );
    const effectiveRate = new Big(oneUnitInFiat);

    const deductibleFee = ctx.preNabla?.deductibleFeeAmountInSwapCurrency ?? new Big(0);
    const inputAmountDecimal = effectiveRate.gt(0)
      ? ctx.subsidy.targetOutputAmountDecimal.div(effectiveRate).round(ALFREDPAY_ERC20_DECIMALS, Big.roundDown)
      : ctx.evmToEvm.outputAmountDecimal.minus(deductibleFee).round(ALFREDPAY_ERC20_DECIMALS, Big.roundDown);

    const customerId = await resolveAlfredpayCustomerId(req.outputCurrency, effectiveUserId);

    const alfredpayService = AlfredpayApiService.getInstance();
    const quoteRequest: CreateAlfredpayOfframpQuoteRequest = {
      chain: AlfredpayChain.MATIC,
      fromAmount: inputAmountDecimal.toString(),
      fromCurrency: ALFREDPAY_ONCHAIN_CURRENCY,
      metadata: {
        businessId: "vortex",
        customerId
      },
      paymentMethodType: AlfredpayPaymentMethodType.BANK,
      toCurrency: req.outputCurrency as unknown as AlfredpayFiatCurrency
    };

    const quote = await alfredpayService.createOfframpQuote(quoteRequest);

    const toAmount = new Big(quote.toAmount);
    const alfredpayFee = AlfredpayApiService.sumFeesByCurrency(
      quote.fees,
      req.outputCurrency as unknown as AlfredpayFiatCurrency
    );

    ctx.alfredpayOfframp = {
      currency: req.outputCurrency,
      expirationDate: new Date(quote.expiration),
      fee: alfredpayFee,
      inputAmountDecimal,
      inputAmountRaw: multiplyByPowerOfTen(inputAmountDecimal, ALFREDPAY_ERC20_DECIMALS).toFixed(0, 0),
      outputAmountDecimal: toAmount,
      outputAmountRaw: multiplyByPowerOfTen(toAmount, 2).toFixed(0, 0),
      quoteId: quote.quoteId
    };

    ctx.addNote?.(
      `OfframpTransactionAlfredpayEngine: ${inputAmountDecimal.toString()} ${ALFREDPAY_ONCHAIN_CURRENCY} -> ${toAmount.toString()} ${req.outputCurrency} (fee ${alfredpayFee.toString()}, rate ${effectiveRate.toString()})`
    );
  }
}
