import {
  AlfredpayApiService,
  AlfredpayChain,
  AlfredpayFiatCurrency,
  AlfredpayOnChainCurrency,
  AlfredpayPaymentMethodType,
  CreateAlfredpayOfframpQuoteRequest,
  ERC20_USDC_POLYGON_DECIMALS,
  multiplyByPowerOfTen,
  RampDirection
} from "@vortexfi/shared";
import Big from "big.js";
import { QuoteContext } from "../../core/types";
import { BaseInitializeEngine } from "./index";

export class OfframpTransactionAlfredpayEngine extends BaseInitializeEngine {
  readonly config = {
    direction: RampDirection.SELL,
    skipNote: "OfframpTransactionAlfredpayEngine: Skipped because rampType is BUY, this engine handles SELL operations only"
  };

  protected async executeInternal(ctx: QuoteContext): Promise<void> {
    const req = ctx.request;

    if (!ctx.evmToEvm) {
      throw new Error("OfframpTransactionAlfredpayEngine: No evmToEvm quote");
    }

    const usdTokenDecimals = ERC20_USDC_POLYGON_DECIMALS;
    const inputAmountDecimal = new Big(ctx.evmToEvm.outputAmountDecimal);

    const alfredpayService = AlfredpayApiService.getInstance();

    const quoteRequest: CreateAlfredpayOfframpQuoteRequest = {
      chain: AlfredpayChain.MATIC,
      fromAmount: inputAmountDecimal.toString(),
      fromCurrency: AlfredpayOnChainCurrency.USDC, // Offramp deposit is USDC
      metadata: {
        businessId: "vortex",
        customerId: req.userId || "unknown"
      },
      paymentMethodType: AlfredpayPaymentMethodType.BANK,
      toCurrency: req.outputCurrency as unknown as AlfredpayFiatCurrency
    };

    const quote = await alfredpayService.createOfframpQuote(quoteRequest);

    const fromAmount = new Big(ctx.evmToEvm.outputAmountDecimal);
    const toAmount = new Big(quote.toAmount);

    const alfredpayFee = Big(0);

    ctx.alfredpayOfframp = {
      currency: ctx.request.outputCurrency,
      expirationDate: new Date(quote.expiration),
      fee: alfredpayFee,
      inputAmountDecimal: fromAmount,
      inputAmountRaw: multiplyByPowerOfTen(fromAmount, usdTokenDecimals).toFixed(0, 0),
      outputAmountDecimal: toAmount,
      outputAmountRaw: multiplyByPowerOfTen(toAmount, 2).toFixed(0, 0), // Assuming 2 decimals for fiat
      quoteId: quote.quoteId
    };

    ctx.addNote?.(
      `Initialized: ${inputAmountDecimal.toString()} ${req.inputCurrency} -> ${toAmount.toString()} ${req.outputCurrency}`
    );
  }
}
