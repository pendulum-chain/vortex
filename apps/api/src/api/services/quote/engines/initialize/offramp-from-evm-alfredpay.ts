import { EvmToken, Networks, OnChainToken, RampDirection } from "@vortexfi/shared";
import Big from "big.js";
import { EvmBridgeQuoteRequest, getEvmBridgeQuote } from "../../core/squidrouter";
import { QuoteContext } from "../../core/types";
import { assignPreNablaContext, BaseInitializeEngine } from "./index";

export class AlfredpayOffRampFromEvmInitializeEngine extends BaseInitializeEngine {
  readonly config = {
    direction: RampDirection.SELL,
    skipNote:
      "AlfredpayOffRampFromEvmInitializeEngine: Skipped because rampType is BUY, this engine handles SELL operations only"
  };

  protected async executeInternal(ctx: QuoteContext): Promise<void> {
    const req = ctx.request;

    const quoteRequest: EvmBridgeQuoteRequest = {
      amountDecimal: req.inputAmount,
      fromNetwork: req.from as Networks,
      inputCurrency: req.inputCurrency as OnChainToken,
      outputCurrency: EvmToken.USDC,
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
      `Initialized: input=${req.inputAmount} ${req.inputCurrency}, raw=${ctx.evmToPendulum?.inputAmountRaw}, output=${ctx.evmToPendulum?.outputAmountDecimal.toString()} ${ctx.evmToPendulum?.toToken}, raw=${ctx.evmToPendulum?.outputAmountRaw}`
    );
  }
}
