/**
 * RouteResolver selects a route strategy based on direction and destination.
 */
import { AssetHubToken, FiatToken, Networks, RampDirection } from "@vortexfi/shared";
import type { QuoteContext } from "../core/types";
import { IRouteStrategy } from "../core/types";
import { OfframpToPixStrategy } from "./strategies/offramp-to-pix.strategy";
import { OfframpToStellarStrategy } from "./strategies/offramp-to-stellar.strategy";
import { OnrampAveniaToAssethubStrategy } from "./strategies/onramp-avenia-to-assethub.strategy";
import { OnrampAveniaToEvmStrategy } from "./strategies/onramp-avenia-to-evm.strategy";
import { OnrampMoneriumToAssethubStrategy } from "./strategies/onramp-monerium-to-assethub.strategy";
import { OnrampMoneriumToEvmStrategy } from "./strategies/onramp-monerium-to-evm.strategy";

export class RouteResolver {
  resolve(ctx: QuoteContext): IRouteStrategy {
    // Onramps
    if (ctx.direction === RampDirection.BUY) {
      if (ctx.to === Networks.AssetHub) {
        if (ctx.from === "pix") {
          return new OnrampAveniaToAssethubStrategy();
        } else {
          return new OnrampMoneriumToAssethubStrategy();
        }
      } else {
        if (ctx.request.inputCurrency === FiatToken.EURC) {
          return new OnrampMoneriumToEvmStrategy();
        } else {
          return new OnrampAveniaToEvmStrategy();
        }
      }
    }

    // Offramps

    // Explicitly disallow Assethub USDT and DOT
    if (ctx.from === Networks.AssetHub) {
      if (ctx.request.inputCurrency === AssetHubToken.USDT) {
        throw new Error("Offramp from USDT on AssetHub is currently not supported");
      } else if (ctx.request.inputCurrency === AssetHubToken.DOT) {
        throw new Error("Offramp from DOT on AssetHub is currently not supported");
      }
    }

    switch (ctx.to) {
      case "pix":
        return new OfframpToPixStrategy();
      case "sepa":
      case "cbu":
      default:
        return new OfframpToStellarStrategy();
    }
  }
}
