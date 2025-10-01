// Behavior parity: replicates current logic for EUR on-ramp to EVM via Squidrouter, zero fees in response.

import {
  createGenericRouteParams,
  ERC20_EURE_POLYGON,
  ERC20_EURE_POLYGON_DECIMALS,
  FiatToken,
  getNetworkFromDestination,
  getOnChainTokenDetails,
  getRoute,
  isAssetHubTokenDetails,
  isOnChainToken,
  Networks,
  parseContractBalanceResponse,
  QuoteFeeStructure,
  QuoteResponse,
  RampDirection
} from "@packages/shared";
import httpStatus from "http-status";
import { v4 as uuidv4 } from "uuid";
import QuoteTicket from "../../../../models/quoteTicket.model";
import { APIError } from "../../../errors/api-error";
import { multiplyByPowerOfTen } from "../../pendulum/helpers";
import { trimTrailingZeros } from "../core/helpers";
import { QuoteContext, QuoteTicketMetadata, Stage, StageKey } from "../core/types";

export class SpecialOnrampEurEvmEngine implements Stage {
  readonly key = StageKey.SpecialOnrampEurEvm;

  async execute(ctx: QuoteContext): Promise<void> {
    const request = ctx.request;

    // Guard: Only handle BUY + input EURC + destination not AssetHub (EVM targets)
    if (request.rampType !== RampDirection.BUY || request.inputCurrency !== FiatToken.EURC) {
      throw new APIError({
        message: "SpecialOnrampEurEvmEngine invoked for non-EUR onramp request",
        status: httpStatus.INTERNAL_SERVER_ERROR
      });
    }

    const inputAmountPostAnchorFeeRaw = multiplyByPowerOfTen(request.inputAmount, ERC20_EURE_POLYGON_DECIMALS).toFixed(0, 0);
    const fromToken = ERC20_EURE_POLYGON;
    const fromNetwork = Networks.Polygon; // Always Polygon for EUR onramp
    const toNetwork = getNetworkFromDestination(request.to);

    if (!toNetwork) {
      throw new APIError({
        message: `Invalid network for destination: ${request.to} `,
        status: httpStatus.BAD_REQUEST
      });
    }

    if (!isOnChainToken(request.outputCurrency)) {
      throw new APIError({
        message: `Output currency cannot be fiat token ${request.outputCurrency} for EUR onramp.`,
        status: httpStatus.BAD_REQUEST
      });
    }

    const outputTokenDetails = getOnChainTokenDetails(toNetwork, request.outputCurrency);
    if (!outputTokenDetails) {
      throw new APIError({
        message: `Output token details not found for ${request.outputCurrency} on network ${toNetwork}`,
        status: httpStatus.BAD_REQUEST
      });
    }

    // Behavior parity: forbid AssetHub tokens in this special-case path
    if (isAssetHubTokenDetails(outputTokenDetails)) {
      throw new APIError({
        message: `AssetHub token ${request.outputCurrency} is not supported for onramp.`,
        status: httpStatus.BAD_REQUEST
      });
    }

    const placeholderAddress = "0x30a300612ab372cc73e53ffe87fb73d62ed68da3";
    const routeParams = createGenericRouteParams({
      amount: inputAmountPostAnchorFeeRaw,
      destinationAddress: placeholderAddress,
      fromAddress: placeholderAddress,
      fromNetwork,
      fromToken,
      toNetwork,
      toToken: outputTokenDetails.erc20AddressSourceChain
    });

    const routeResult = await getRoute(routeParams);
    const { route } = routeResult.data;
    const finalGrossOutputAmount = route.estimate.toAmount;
    const finalGrossOutputAmountDecimal = parseContractBalanceResponse(
      outputTokenDetails.decimals,
      BigInt(finalGrossOutputAmount)
    ).preciseBigDecimal;

    const feeToStore: QuoteFeeStructure = {
      anchor: "0",
      currency: ctx.targetFeeFiatCurrency,
      network: "0",
      partnerMarkup: "0",
      total: "0",
      vortex: "0"
    };

    const quote = await QuoteTicket.create({
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      fee: feeToStore,
      from: request.from,
      id: uuidv4(),
      inputAmount: request.inputAmount,
      inputCurrency: request.inputCurrency,
      metadata: {} as QuoteTicketMetadata,
      outputAmount: finalGrossOutputAmountDecimal.toFixed(6, 0),
      outputCurrency: request.outputCurrency,
      partnerId: ctx.partner?.id || null,
      rampType: request.rampType,
      status: "pending",
      to: request.to
    });

    const responseFeeStructure: QuoteFeeStructure = {
      anchor: "0",
      currency: ctx.targetFeeFiatCurrency,
      network: "0",
      partnerMarkup: "0",
      total: "0",
      vortex: "0"
    };

    ctx.builtResponse = {
      expiresAt: quote.expiresAt,
      fee: responseFeeStructure,
      from: quote.from,
      id: quote.id,
      inputAmount: trimTrailingZeros(quote.inputAmount),
      inputCurrency: quote.inputCurrency,
      outputAmount: trimTrailingZeros(finalGrossOutputAmountDecimal.toFixed(6, 0)),
      outputCurrency: quote.outputCurrency,
      rampType: quote.rampType,
      to: quote.to
    };
    ctx.addNote?.("SpecialOnrampEurEvmEngine: persisted quote and built response");
  }
}
