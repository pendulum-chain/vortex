import {
  AlfredpayApiService,
  AlfredpayChain,
  AlfredpayFiatCurrency,
  AlfredpayOnChainCurrency,
  AlfredpayPaymentMethodType,
  CreateAlfredpayOnrampQuoteRequest,
  CreateAlfredpayOnrampRequest,
  ERC20_USDC_POLYGON_DECIMALS,
  multiplyByPowerOfTen,
  Networks,
  RampDirection
} from "@vortexfi/shared";
import Big from "big.js";
import { QuoteContext } from "../../core/types";
import { BaseInitializeEngine } from "./index";

export class OnRampInitializeAlfredpayEngine extends BaseInitializeEngine {
  readonly config = {
    direction: RampDirection.BUY,
    skipNote: "OnRampInitializeAlfredpayEngine: Skipped because rampType is SELL, this engine handles BUY operations only"
  };

  protected async executeInternal(ctx: QuoteContext): Promise<void> {
    const req = ctx.request;

    const usdTokenDecimals = ERC20_USDC_POLYGON_DECIMALS;
    const inputAmountDecimal = new Big(req.inputAmount);

    const alfredpayService = AlfredpayApiService.getInstance();

    const quoteRequest: CreateAlfredpayOnrampQuoteRequest = {
      chain: AlfredpayChain.MATIC,
      fromAmount: inputAmountDecimal.toString(),
      fromCurrency: req.inputCurrency as unknown as AlfredpayFiatCurrency,
      metadata: {
        businessId: "vortex",
        customerId: req.userId || "unknown"
      }, // Mints hardcoded to Polygon.
      paymentMethodType: AlfredpayPaymentMethodType.BANK,
      toCurrency: AlfredpayOnChainCurrency.USDC // Mints hardcoded to USDC, on Polygon.
    };

    const quote = await alfredpayService.createOnrampQuote(quoteRequest);

    const fromAmount = new Big(quote.fromAmount);
    const toAmount = new Big(quote.toAmount);

    const alfredpayFee = Big(0);

    ctx.alfredpayMint = {
      currency: ctx.request.inputCurrency,
      expirationDate: new Date(quote.expiration),
      fee: alfredpayFee,
      inputAmountDecimal: fromAmount,
      inputAmountRaw: multiplyByPowerOfTen(fromAmount, usdTokenDecimals).toFixed(0, 0),
      outputAmountDecimal: toAmount,
      outputAmountRaw: multiplyByPowerOfTen(toAmount, usdTokenDecimals).toFixed(0, 0),
      quoteId: quote.quoteId
    };

    ctx.addNote?.(
      `Initialized: ${inputAmountDecimal.toString()} ${req.inputCurrency} -> ${toAmount.toString()} ${req.outputCurrency}`
    );
  }
}
