/**
 * RouteResolver selects a route strategy based on direction and destination.
 */
import { DestinationType, Networks, RampDirection } from "@packages/shared";
import type { QuoteContext } from "../types";
import { IRouteStrategy, RouteProfile } from "../types";
import { OffRampCbuStrategy } from "./strategies/offramp-cbu.strategy";
import { OffRampPixStrategy } from "./strategies/offramp-pix.strategy";
import { OffRampSepaStrategy } from "./strategies/offramp-sepa.strategy";
import { OnRampAssethubStrategy } from "./strategies/onramp-assethub.strategy";
import { OnRampEvmStrategy } from "./strategies/onramp-evm.strategy";

const OFFRAMP_DESTS = new Set<DestinationType>(["pix", "sepa", "cbu"]);

export class RouteResolver {
  resolve(ctx: QuoteContext): IRouteStrategy {
    if (ctx.direction === RampDirection.BUY) {
      // On-ramp
      if (ctx.to === Networks.AssetHub) {
        return new OnRampAssethubStrategy();
      }
      // Any non-AssetHub chain treated as EVM (Polygon/Ethereum/Base/etc.)
      return new OnRampEvmStrategy();
    }

    // Off-ramp
    if (!OFFRAMP_DESTS.has(ctx.to)) {
      // Fallback: default to SEPA strategy
      return new OffRampSepaStrategy();
    }

    switch (ctx.to) {
      case "pix":
        return new OffRampPixStrategy();
      case "sepa":
        return new OffRampSepaStrategy();
      case "cbu":
        return new OffRampCbuStrategy();
      default:
        return new OffRampSepaStrategy();
    }
  }
}
