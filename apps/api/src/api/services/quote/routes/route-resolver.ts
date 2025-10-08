/**
 * RouteResolver selects a route strategy based on direction and destination.
 */
import { FiatToken, Networks, RampDirection } from "@packages/shared";
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
