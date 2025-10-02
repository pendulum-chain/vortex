/**
 * RouteResolver selects a route strategy based on direction and destination.
 */
import { Networks, RampDirection } from "@packages/shared";
import type { QuoteContext } from "../core/types";
import { IRouteStrategy } from "../core/types";
import { OfframpToPixStrategy } from "./strategies/offramp-to-pix.strategy";
import { OfframpToStellarStrategy } from "./strategies/offramp-to-stellar.strategy";
import { OnrampAveniaToAssethubStrategy } from "./strategies/onramp-avenia-to-assethub.strategy";
import { OnrampMoneriumToAssethubStrategy } from "./strategies/onramp-monerium-to-assethub.strategy";
import { OnrampToEvmStrategy } from "./strategies/onramp-to-evm.strategy";

export class RouteResolver {
  resolve(ctx: QuoteContext): IRouteStrategy {
    if (ctx.direction === RampDirection.BUY) {
      if (ctx.to === Networks.AssetHub) {
        if (ctx.from === "pix") {
          return new OnrampAveniaToAssethubStrategy();
        } else {
          return new OnrampMoneriumToAssethubStrategy();
        }
      }
      // Any non-AssetHub chain treated as EVM (Polygon/Ethereum/Base/etc.)
      return new OnrampToEvmStrategy();
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
