// PR1 scaffolding: Price Feed Adapter
// Centralizes currency conversion and crypto price fetches.
// In later PRs, this will add rounding/precision policies and retries.

import { priceFeedService } from "../../../priceFeed.service";

export class PriceFeedAdapter {
  async convertCurrency(amount: string, from: string, to: string): Promise<string> {
    // Delegates to existing service; policies to be added in later PRs
    return priceFeedService.convertCurrency(amount, from as any, to as any);
  }

  async getCryptoPrice(chainOrSymbol: string, vsCurrency: string): Promise<string | number> {
    return priceFeedService.getCryptoPrice(chainOrSymbol as any, vsCurrency as any);
  }
}
