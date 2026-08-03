import {
  ALFREDPAY_ONCHAIN_CURRENCY,
  AlfredpayApiService,
  AlfredpayChain,
  type AlfredpayFiatCurrency,
  AlfredpayPaymentMethodType,
  type CreateAlfredpayOnrampRequest
} from "@vortexfi/shared";
import Big from "big.js";
import httpStatus from "http-status";
import logger from "../../../../../../config/logger";
import { APIError } from "../../../../../errors/api-error";
import { resolveAlfredpayCustomerId } from "../../../../quote/alfredpay-customer";
import type { StartCtx, StartResult } from "../../core/types";
import type { AlfredpayMintMetadata } from "./simulation";
import type { AlfredpayMintPreparation } from "./transactions";

interface AlfredpayMintStartDependencies {
  resolveCustomerId?: typeof resolveAlfredpayCustomerId;
  service?: Pick<AlfredpayApiService, "createOnramp" | "createOnrampQuote">;
  sumFees?: typeof AlfredpayApiService.sumFeesByCurrency;
}

export async function startAlfredpayMint(
  ctx: StartCtx<AlfredpayMintMetadata>,
  dependencies: AlfredpayMintStartDependencies = {}
): Promise<StartResult<AlfredpayMintMetadata>> {
  if (ctx.state.alfredpayTransactionId) {
    return {};
  }
  if (!ctx.metadata?.quoteId) {
    throw new APIError({ message: "Missing Alfredpay quote ID in metadata", status: httpStatus.BAD_REQUEST });
  }
  if (!ctx.userId) {
    throw new APIError({ message: "Missing user ID in ramp state", status: httpStatus.BAD_REQUEST });
  }
  if (!ctx.state.destinationAddress) {
    throw new APIError({ message: "Destination address not found in ramp state", status: httpStatus.BAD_REQUEST });
  }
  const preparation = ctx.ownState as AlfredpayMintPreparation | undefined;
  if (!preparation?.userId) {
    throw new APIError({ message: "Missing Alfredpay user ID in ramp state", status: httpStatus.BAD_REQUEST });
  }

  const service = dependencies.service ?? AlfredpayApiService.getInstance();
  const fromCurrency = ctx.quote.inputCurrency as unknown as AlfredpayFiatCurrency;
  const originalQuoteId = ctx.metadata.quoteId;
  let effectiveQuoteId = originalQuoteId;
  let metadata: AlfredpayMintMetadata | undefined;
  const customerId = await (dependencies.resolveCustomerId ?? resolveAlfredpayCustomerId)(fromCurrency, ctx.userId);

  try {
    const freshQuote = await service.createOnrampQuote({
      chain: AlfredpayChain.MATIC,
      fromAmount: new Big(ctx.quote.inputAmount).toString(),
      fromCurrency,
      metadata: { businessId: "vortex", customerId },
      paymentMethodType: AlfredpayPaymentMethodType.BANK,
      toCurrency: ALFREDPAY_ONCHAIN_CURRENCY
    });
    const originalToAmount = new Big(ctx.metadata.outputAmountDecimal as unknown as string);
    const freshToAmount = new Big(freshQuote.toAmount);
    const originalFee = new Big(ctx.metadata.fee as unknown as string);
    const freshFee = (dependencies.sumFees ?? AlfredpayApiService.sumFeesByCurrency)(freshQuote.fees, fromCurrency);
    if (!freshToAmount.eq(originalToAmount) || !freshFee.eq(originalFee)) {
      logger.warn(
        `[startAlfredpayMint] Quote ${ctx.quote.id}: refreshed Alfredpay quote drifted. ` +
          `toAmount original=${originalToAmount.toString()} fresh=${freshToAmount.toString()}, ` +
          `fee original=${originalFee.toString()} fresh=${freshFee.toString()}. ` +
          `Falling back to original quoteId ${originalQuoteId}.`
      );
    } else {
      effectiveQuoteId = freshQuote.quoteId;
      metadata = { ...ctx.metadata, expirationDate: new Date(freshQuote.expiration), quoteId: freshQuote.quoteId };
      logger.info(
        `[startAlfredpayMint] Quote ${ctx.quote.id}: swapped Alfredpay quote ${originalQuoteId} -> ${freshQuote.quoteId}.`
      );
    }
  } catch (error) {
    logger.warn(
      `[startAlfredpayMint] Quote ${ctx.quote.id}: refresh failed (${error instanceof Error ? error.message : String(error)}). ` +
        `Falling back to original quoteId ${originalQuoteId}.`
    );
  }

  const orderRequest: CreateAlfredpayOnrampRequest = {
    amount: ctx.quote.inputAmount,
    chain: AlfredpayChain.MATIC,
    customerId: preparation.userId,
    depositAddress: ctx.state.evmEphemeralAddress,
    fromCurrency,
    paymentMethodType: AlfredpayPaymentMethodType.BANK,
    quoteId: effectiveQuoteId,
    toCurrency: ALFREDPAY_ONCHAIN_CURRENCY
  };
  const order = await service.createOnramp(orderRequest);
  return {
    metadata,
    responseArtifacts: { achPaymentData: order.fiatPaymentInstructions },
    state: {
      alfredpayTransactionId: order.transaction.transactionId,
      fiatPaymentInstructions: order.fiatPaymentInstructions
    }
  };
}
