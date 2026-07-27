import { ALFREDPAY_EVM_TOKEN, EvmToken, Networks, OnChainToken, RampCurrency, RampDirection } from "@vortexfi/shared";
import Big from "big.js";
import { priceFeedService } from "../../../priceFeed.service";
import { EvmBridgeQuoteRequest, getEvmBridgeQuote } from "../../core/squidrouter";
import { QuoteContext } from "../../core/types";
import { assignPreNablaContext, BaseInitializeEngine } from "./index";

export class OffRampFromEvmInitializeAlfredpayEngine extends BaseInitializeEngine {
  readonly config = {
    direction: RampDirection.SELL,
    skipNote:
      "OffRampFromEvmInitializeAlfredpayEngine: Skipped because rampType is BUY, this engine handles SELL operations only"
  };

  protected async executeInternal(ctx: QuoteContext): Promise<void> {
    const req = ctx.request;

    await assignPreNablaContext(ctx);

    const preNabla = ctx.preNabla;
    const feeCurrency = preNabla?.feeCurrency;
    const partnerMarkupFee = preNabla?.partnerMarkupFeeInFeeCurrency;
    const vortexFee = preNabla?.vortexFeeInFeeCurrency;
    if (!preNabla || !feeCurrency || !partnerMarkupFee || !vortexFee) {
      throw new Error("OffRampFromEvmInitializeAlfredpayEngine: Missing pre-Nabla platform fee components");
    }

    // Freeze the exact rounded components used by the quote. The Discount stage runs
    // before the Fee stage on this route, so recalculating later would allow a price-feed
    // or pricing-config change to make the charged residual diverge from distribution.
    const partnerMarkupAmount = partnerMarkupFee.toFixed(2);
    const vortexAmount = vortexFee.toFixed(2);
    const [partnerMarkupUsd, vortexUsd] = await Promise.all([
      priceFeedService.convertCurrency(partnerMarkupAmount, feeCurrency, EvmToken.USDC as RampCurrency),
      priceFeedService.convertCurrency(vortexAmount, feeCurrency, EvmToken.USDC as RampCurrency)
    ]);
    preNabla.platformFeeSnapshot = {
      feeCurrency,
      partnerMarkup: { amount: partnerMarkupAmount, usd: partnerMarkupUsd },
      vortex: { amount: vortexAmount, usd: vortexUsd }
    };

    const quoteRequest: EvmBridgeQuoteRequest = {
      amountDecimal: req.inputAmount,
      fromNetwork: req.from as Networks,
      inputCurrency: req.inputCurrency as OnChainToken,
      outputCurrency: ALFREDPAY_EVM_TOKEN,
      rampType: req.rampType,
      toNetwork: Networks.Polygon
    };
    const bridgeQuote = await getEvmBridgeQuote(quoteRequest);

    ctx.evmToEvm = {
      ...quoteRequest,
      fromToken: bridgeQuote.fromToken,
      inputAmountDecimal: Big(quoteRequest.amountDecimal),
      inputAmountRaw: bridgeQuote.inputAmountRaw,
      networkFeeUSD: bridgeQuote.networkFeeUSD,
      outputAmountDecimal: bridgeQuote.outputAmountDecimal,
      outputAmountRaw: bridgeQuote.outputAmountRaw,
      toToken: bridgeQuote.toToken
    };

    ctx.addNote?.(
      `Initialized: input=${req.inputAmount} ${req.inputCurrency}, raw=${ctx.evmToEvm?.inputAmountRaw}, output=${ctx.evmToEvm?.outputAmountDecimal.toString()} ${ctx.evmToEvm?.toToken}, raw=${ctx.evmToEvm?.outputAmountRaw}`
    );
  }
}
