import { EvmToken, Networks, OnChainToken, RampDirection } from "@packages/shared";
import Big from "big.js";
import { EvmBridgeQuoteRequest, getEvmBridgeQuote } from "../../core/squidrouter";
import { QuoteContext } from "../../core/types";
import { assignPreNablaContext, BaseInitializeEngine } from "./index";

export class OffRampFromEvmInitializeEngine extends BaseInitializeEngine {
  readonly config = { direction: RampDirection.SELL, skipNote: "Skipped for on-ramp request" };

  protected async executeInternal(ctx: QuoteContext): Promise<void> {
    await assignPreNablaContext(ctx);

    const req = ctx.request;

    const quoteRequest: EvmBridgeQuoteRequest = {
      amountDecimal: req.inputAmount,
      fromNetwork: req.from as Networks,
      inputCurrency: req.inputCurrency as OnChainToken,
      outputCurrency: EvmToken.AXLUSDC as unknown as OnChainToken,
      rampType: req.rampType,
      toNetwork: Networks.Moonbeam
    };

    const bridgeQuote = await getEvmBridgeQuote(quoteRequest);

    ctx.evmToPendulum = {
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
