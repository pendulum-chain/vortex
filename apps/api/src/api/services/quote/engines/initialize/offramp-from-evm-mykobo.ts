import { EvmToken, Networks, OnChainToken, RampDirection } from "@vortexfi/shared";
import Big from "big.js";
import { EvmBridgeQuoteRequest, getEvmBridgeQuote } from "../../core/squidrouter";
import { QuoteContext } from "../../core/types";
import { assignPreNablaContext, BaseInitializeEngine } from "./index";

export class OffRampFromEvmInitializeMykoboEngine extends BaseInitializeEngine {
  readonly config = {
    direction: RampDirection.SELL,
    skipNote: "OffRampFromEvmInitializeMykoboEngine: Skipped because rampType is BUY, this engine handles SELL operations only"
  };

  protected async executeInternal(ctx: QuoteContext): Promise<void> {
    const req = ctx.request;

    await assignPreNablaContext(ctx);

    const quoteRequest: EvmBridgeQuoteRequest = {
      amountDecimal: req.inputAmount,
      fromNetwork: req.from as Networks,
      inputCurrency: req.inputCurrency as OnChainToken,
      outputCurrency: EvmToken.USDC,
      rampType: req.rampType,
      toNetwork: Networks.Base
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
