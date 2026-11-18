import { EvmToken, Networks, RELAY_BASE_USDC_ADDRESS } from "@vortexfi/shared";
import { BASE_PAXG_ADDRESS, GOLD_TOKEN } from "../../core/gold-base";
import { ROBINHOOD_STOCKS, type StockSymbol } from "../../core/robinhood-stocks";

export type StockSourceToken = StockSymbol | typeof EvmToken.USDC | typeof GOLD_TOKEN;

/** Code-owned source pins: a stock on Robinhood Chain, native Base USDC for a purchase, or PAXG on Base for a Gold sale. */
export function stockSourcePin(token: StockSourceToken): {
  address: `0x${string}`;
  network: typeof Networks.Base | typeof Networks.Robinhood;
} {
  if (token === EvmToken.USDC) {
    return { address: RELAY_BASE_USDC_ADDRESS as `0x${string}`, network: Networks.Base as typeof Networks.Base };
  }
  if (token === GOLD_TOKEN) {
    return { address: BASE_PAXG_ADDRESS, network: Networks.Base as typeof Networks.Base };
  }
  return { address: ROBINHOOD_STOCKS[token].address, network: Networks.Robinhood as typeof Networks.Robinhood };
}
