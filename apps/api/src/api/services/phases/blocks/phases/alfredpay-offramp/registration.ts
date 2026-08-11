import {
  ALFREDPAY_ONCHAIN_CURRENCY,
  AlfredpayApiService,
  AlfredpayChain,
  type AlfredpayFiatCurrency,
  AlfredpayOfframpStatus,
  AlfredpayPaymentMethodType,
  type CreateAlfredpayOfframpQuoteRequest,
  EphemeralAccountType
} from "@vortexfi/shared";
import Big from "big.js";
import httpStatus from "http-status";
import { APIError } from "../../../../../errors/api-error";
import { resolveAlfredpayCustomerId } from "../../../../quote/alfredpay-customer";
import { requireAccount } from "../../core/accounts";
import { FinancialOperationRejectedError } from "../../core/financial-operation";
import type { RegisterCtx, RegistrationResult } from "../../core/types";
import { type AlfredpayOfframpMetadata, hasSafeAlfredpayExecutionLifetime, hasSafeAlfredpayQuoteLifetime } from "./simulation";

export interface AlfredpayOfframpRegistrationInput extends Record<string, unknown> {
  fiatAccountId?: string;
  walletAddress?: string;
}

export interface AlfredpayOfframpRegistrationFacts {
  alfredpayTransactionId: string;
  alfredpayUserId: string;
  depositAddress: string;
  fiatAccountId: string;
  walletAddress: string;
}

export async function registerAlfredpayOfframp<Metadata extends AlfredpayOfframpMetadata>(
  ctx: RegisterCtx<Metadata, AlfredpayOfframpRegistrationInput>,
  dependencies: {
    resolveCustomerId?: typeof resolveAlfredpayCustomerId;
    service?: Pick<AlfredpayApiService, "createOfframp" | "createOfframpQuote">;
    sumFees?: typeof AlfredpayApiService.sumFeesByCurrency;
  } = {}
): Promise<RegistrationResult<AlfredpayOfframpRegistrationFacts, Metadata>> {
  if (!ctx.input.fiatAccountId) {
    throw new APIError({ message: "fiatAccountId is required for Alfredpay offramp", status: httpStatus.BAD_REQUEST });
  }
  if (!ctx.input.walletAddress) {
    throw new APIError({ message: "Wallet address is required for Alfredpay offramp", status: httpStatus.BAD_REQUEST });
  }
  const evmEphemeral = requireAccount(
    Object.fromEntries(ctx.signingAccounts.map(account => [account.type, account])),
    EphemeralAccountType.EVM
  );
  let customerId: string;
  let freshQuote: Awaited<ReturnType<AlfredpayApiService["createOfframpQuote"]>>;
  const service = dependencies.service ?? AlfredpayApiService.getInstance();
  const toCurrency = ctx.metadata.currency as unknown as AlfredpayFiatCurrency;
  try {
    customerId = await (dependencies.resolveCustomerId ?? resolveAlfredpayCustomerId)(
      ctx.metadata.currency,
      ctx.authenticatedUser.id
    );
    freshQuote = await service.createOfframpQuote({
      chain: AlfredpayChain.MATIC,
      fromAmount: new Big(ctx.metadata.inputAmountDecimal as unknown as string).toString(),
      fromCurrency: ALFREDPAY_ONCHAIN_CURRENCY,
      metadata: { businessId: "vortex", customerId },
      paymentMethodType: AlfredpayPaymentMethodType.BANK,
      toCurrency
    } satisfies CreateAlfredpayOfframpQuoteRequest);
  } catch (error) {
    throw new FinancialOperationRejectedError(
      `Alfredpay offramp registration preflight failed before order creation: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  const originalInput = new Big(ctx.metadata.inputAmountDecimal as unknown as string);
  const freshInput = new Big(freshQuote.fromAmount);
  const originalOutput = new Big(ctx.metadata.outputAmountDecimal as unknown as string);
  const freshOutput = new Big(freshQuote.toAmount);
  const originalFee = new Big(ctx.metadata.fee as unknown as string);
  const freshFee = (dependencies.sumFees ?? AlfredpayApiService.sumFeesByCurrency)(freshQuote.fees, toCurrency);
  if (
    (freshQuote.chain !== undefined && freshQuote.chain !== AlfredpayChain.MATIC) ||
    freshQuote.fromCurrency !== ALFREDPAY_ONCHAIN_CURRENCY ||
    freshQuote.toCurrency !== toCurrency ||
    !freshInput.eq(originalInput) ||
    !freshOutput.eq(originalOutput) ||
    !freshFee.eq(originalFee) ||
    !hasSafeAlfredpayQuoteLifetime(freshQuote.expiration)
  ) {
    throw new FinancialOperationRejectedError(
      `Refreshed Alfredpay offramp quote drifted: pair expected=${ALFREDPAY_ONCHAIN_CURRENCY}/${toCurrency} fresh=${freshQuote.fromCurrency}/${freshQuote.toCurrency}, ` +
        `fromAmount original=${originalInput.toString()} fresh=${freshInput.toString()}, ` +
        `toAmount original=${originalOutput.toString()} fresh=${freshOutput.toString()}, ` +
        `fee original=${originalFee.toString()} fresh=${freshFee.toString()}. Cannot proceed with offramp order.`
    );
  }
  const order = await service.createOfframp({
    amount: new Big(ctx.metadata.inputAmountDecimal as unknown as string).toString(),
    chain: AlfredpayChain.MATIC,
    customerId,
    fiatAccountId: ctx.input.fiatAccountId,
    fromCurrency: ALFREDPAY_ONCHAIN_CURRENCY,
    originAddress: evmEphemeral.address,
    quoteId: freshQuote.quoteId,
    toCurrency
  });
  if (
    order.chain !== AlfredpayChain.MATIC ||
    order.status !== AlfredpayOfframpStatus.CREATED ||
    order.customerId !== customerId ||
    order.fiatAccountId !== ctx.input.fiatAccountId ||
    order.fromCurrency !== ALFREDPAY_ONCHAIN_CURRENCY ||
    order.toCurrency !== toCurrency ||
    !order.transactionId ||
    !new Big(order.fromAmount).eq(originalInput) ||
    !new Big(order.toAmount).eq(originalOutput) ||
    !hasSafeAlfredpayExecutionLifetime(order.expiration)
  ) {
    throw new APIError({
      message:
        `Created Alfredpay offramp order drifted from the registered quote: chain expected=${AlfredpayChain.MATIC} order=${order.chain}, ` +
        `pair expected=${ALFREDPAY_ONCHAIN_CURRENCY}/${toCurrency} order=${order.fromCurrency}/${order.toCurrency}, ` +
        `fromAmount expected=${originalInput.toString()} order=${order.fromAmount}, ` +
        `toAmount expected=${originalOutput.toString()} order=${order.toAmount}`,
      status: httpStatus.SERVICE_UNAVAILABLE
    });
  }
  return {
    facts: {
      alfredpayTransactionId: order.transactionId,
      alfredpayUserId: customerId,
      depositAddress: order.depositAddress,
      fiatAccountId: ctx.input.fiatAccountId,
      walletAddress: ctx.input.walletAddress
    },
    metadata: {
      ...ctx.metadata,
      expirationDate: new Date(freshQuote.expiration),
      quoteId: freshQuote.quoteId
    }
  };
}
