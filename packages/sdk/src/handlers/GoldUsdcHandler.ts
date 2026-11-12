import { Networks, type QuoteResponse, RampDirection, type RampProcess } from "@vortexfi/shared";
import { isAddress } from "viem";
import { BaseRampHandler } from "./BaseRampHandler.js";

/** Narrow same-chain gold corridor. No fiat provider or stock handler is involved. */
export function isGoldUsdcQuote(quote: QuoteResponse): boolean {
  if (quote.network !== Networks.Base || quote.from !== Networks.Base || quote.to !== Networks.Base) return false;
  return quote.rampType === RampDirection.BUY
    ? String(quote.inputCurrency) === "USDC" && String(quote.outputCurrency) === "PAXG"
    : quote.rampType === RampDirection.SELL &&
        String(quote.inputCurrency) === "PAXG" &&
        String(quote.outputCurrency) === "USDC";
}

export class GoldUsdcHandler extends BaseRampHandler {
  async register(quoteId: string, data: { walletAddress: string; destinationAddress: string }): Promise<RampProcess> {
    if (!isAddress(data.walletAddress) || !isAddress(data.destinationAddress)) {
      throw new Error("Gold USDC registration requires walletAddress and destinationAddress.");
    }
    return this.registerAndPresign(quoteId, { destinationAddress: data.destinationAddress, walletAddress: data.walletAddress });
  }
}
