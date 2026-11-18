import { EvmToken, Networks, type QuoteResponse, RampDirection, type RampProcess } from "@vortexfi/shared";
import type { StockUsdcAdditionalData } from "../types.js";
import { BaseRampHandler } from "./BaseRampHandler.js";

export function isStockUsdcQuote(q: QuoteResponse): boolean {
  return q.rampType === RampDirection.BUY
    ? q.from === Networks.Base && q.to === Networks.Robinhood && q.inputCurrency === EvmToken.USDC
    : q.from === Networks.Robinhood && q.to === Networks.Base && q.outputCurrency === EvmToken.USDC;
}

/** Uses the common ephemeral custody and presigning lifecycle, with no fiat provider calls. */
export class StockUsdcHandler extends BaseRampHandler {
  async register(quoteId: string, data: StockUsdcAdditionalData): Promise<RampProcess> {
    return this.registerAndPresign(quoteId, {
      destinationAddress: data.destinationAddress,
      walletAddress: data.walletAddress
    });
  }
}
