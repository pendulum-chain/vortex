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
import { offrampEvmToAlfredpayStrategy } from "./strategies/offramp-evm-to-alfredpay.strategy";
import { offrampToPixStrategy } from "./strategies/offramp-to-pix.strategy";
import { offrampToPixEvmStrategy } from "./strategies/offramp-to-pix-base.strategy";
import { offrampToSepaEvmStrategy } from "./strategies/offramp-to-sepa-evm.strategy";
import { onrampAlfredpayToEvmStrategy } from "./strategies/onramp-alfredpay-to-evm.strategy";
import { onrampAveniaToAssethubStrategy } from "./strategies/onramp-avenia-to-assethub.strategy";
import { onrampAveniaToEvmBaseStrategy } from "./strategies/onramp-avenia-to-evm.strategy-base";
import { onrampMykoboToEvmStrategy } from "./strategies/onramp-mykobo-to-evm.strategy";

const ALFREDPAY_PAYMENT_METHODS: ReadonlySet<string> = new Set([EPaymentMethod.ACH, EPaymentMethod.SPEI, EPaymentMethod.WIRE]);

export class RouteResolver {
  resolve(ctx: QuoteContext): IRouteStrategy {
    // Onramps
    if (ctx.direction === RampDirection.BUY) {
      if (ctx.to === Networks.AssetHub) {
        if (isAlfredpayToken(ctx.request.inputCurrency as FiatToken)) {
          throw new APIError({ message: QuoteError.AssetHubNotSupportedForAlfredPay, status: httpStatus.BAD_REQUEST });
        }
        if (ctx.request.inputCurrency === FiatToken.EURC) {
          throw new APIError({
            message: "EUR onramp to AssetHub is not supported; please choose an EVM destination chain",
            status: httpStatus.BAD_REQUEST
          });
        }
        return onrampAveniaToAssethubStrategy;
      } else {
        if (ctx.request.inputCurrency === FiatToken.EURC) {
          return onrampMykoboToEvmStrategy;
        } else if (isAlfredpayToken(ctx.request.inputCurrency as FiatToken)) {
          return onrampAlfredpayToEvmStrategy;
        } else {
          return onrampAveniaToEvmBaseStrategy;
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
        return ctx.from === Networks.AssetHub ? offrampToPixStrategy : offrampToPixEvmStrategy;
      case "wire":
      case "ach":
      case "spei":
      case "cbu":
        return offrampEvmToAlfredpayStrategy;
      case "sepa":
        return offrampToSepaEvmStrategy;
      default:
        throw new APIError({ message: "ARS offramp temporarily unavailable", status: httpStatus.BAD_REQUEST });
    }
  }
}
