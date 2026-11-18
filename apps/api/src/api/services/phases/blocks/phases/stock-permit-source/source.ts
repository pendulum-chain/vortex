import { EvmToken, Networks, RELAY_BASE_USDC_ADDRESS } from "@vortexfi/shared";
import { ROBINHOOD_STOCKS, type StockSymbol } from "../../core/robinhood-stocks";

export type StockSourceToken = StockSymbol | typeof EvmToken.USDC;

/** Code-owned source pins: a stock on Robinhood Chain, or native Base USDC for a stock purchase. */
export function stockSourcePin(token: StockSourceToken): {
  address: `0x${string}`;
  network: typeof Networks.Base | typeof Networks.Robinhood;
} {
  return token === EvmToken.USDC
    ? { address: RELAY_BASE_USDC_ADDRESS as `0x${string}`, network: Networks.Base as typeof Networks.Base }
    : { address: ROBINHOOD_STOCKS[token].address, network: Networks.Robinhood as typeof Networks.Robinhood };
}
