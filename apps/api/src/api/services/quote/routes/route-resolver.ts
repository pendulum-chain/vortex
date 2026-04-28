/**
 * RouteResolver selects a route strategy based on direction and destination.
 */
import {
  AssetHubToken,
  EPaymentMethod,
  FiatToken,
  isAlfredpayToken,
  Networks,
  QuoteError,
  RampDirection
} from "@vortexfi/shared";
import httpStatus from "http-status";
import { APIError } from "../../../errors/api-error";
import type { QuoteContext } from "../core/types";
import { IRouteStrategy } from "../core/types";
import { OfframpEvmToAlfredpayStrategy } from "./strategies/offramp-evm-to-alfredpay.strategy";
import { OfframpToPixEvmStrategy } from "./strategies/offramp-to-pix-base.strategy";
import { OfframpToStellarStrategy } from "./strategies/offramp-to-stellar.strategy";
import { OnrampAlfredpayToEvmStrategy } from "./strategies/onramp-alfredpay-to-evm.strategy";
import { OnrampAveniaToAssethubStrategy } from "./strategies/onramp-avenia-to-assethub.strategy";
import { OnrampAveniaToEvmBaseStrategy } from "./strategies/onramp-avenia-to-evm.strategy-base";
import { OnrampMoneriumToAssethubStrategy } from "./strategies/onramp-monerium-to-assethub.strategy";
import { OnrampMoneriumToEvmStrategy } from "./strategies/onramp-monerium-to-evm.strategy";

const ALFREDPAY_PAYMENT_METHODS: ReadonlySet<string> = new Set([EPaymentMethod.ACH, EPaymentMethod.SPEI, EPaymentMethod.WIRE]);

export class RouteResolver {
  resolve(ctx: QuoteContext): IRouteStrategy {
    // Onramps
    if (ctx.direction === RampDirection.BUY) {
      if (ctx.to === Networks.AssetHub) {
        if (isAlfredpayToken(ctx.request.inputCurrency as FiatToken)) {
          throw new APIError({ message: QuoteError.AssetHubNotSupportedForAlfredPay, status: httpStatus.BAD_REQUEST });
        }
        if (ctx.from === "pix") {
          return new OnrampAveniaToAssethubStrategy();
        } else {
          return new OnrampMoneriumToAssethubStrategy();
        }
      } else {
        if (ctx.request.inputCurrency === FiatToken.EURC) {
          return new OnrampMoneriumToEvmStrategy();
        } else if (isAlfredpayToken(ctx.request.inputCurrency as FiatToken)) {
          return new OnrampAlfredpayToEvmStrategy();
        } else {
          return new OnrampAveniaToEvmBaseStrategy();
        }
      }
    }

    // Offramps

    // Explicitly disallow Assethub USDT and DOT
    if (ctx.from === Networks.AssetHub) {
      if (ALFREDPAY_PAYMENT_METHODS.has(ctx.to)) {
        throw new APIError({ message: QuoteError.AssetHubNotSupportedForAlfredPay, status: httpStatus.BAD_REQUEST });
      }
      if (ctx.request.inputCurrency === AssetHubToken.USDT) {
        throw new Error("Offramp from USDT on AssetHub is currently not supported");
      } else if (ctx.request.inputCurrency === AssetHubToken.DOT) {
        throw new Error("Offramp from DOT on AssetHub is currently not supported");
      }
    }

    switch (ctx.to) {
      case "pix":
        return new OfframpToPixEvmStrategy();
      case "wire":
      case "ach":
      case "spei":
        return new OfframpEvmToAlfredpayStrategy();
      case "sepa":
      case "cbu":
      default:
        return new OfframpToStellarStrategy();
    }
  }
}
