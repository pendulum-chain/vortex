import {
  ALFREDPAY_ONCHAIN_CURRENCY,
  AlfredpayApiService,
  AlfredpayChain,
  type AlfredpayFiatCurrency,
  AlfredpayPaymentMethodType,
  type CreateAlfredpayOfframpQuoteRequest,
  EphemeralAccountType
} from "@vortexfi/shared";
import Big from "big.js";
import httpStatus from "http-status";
import { APIError } from "../../../../../errors/api-error";
import { resolveAlfredpayCustomerId } from "../../../alfredpay-customer";
import { requireAccount } from "../../core/accounts";
import type { RegisterCtx, RegistrationResult } from "../../core/types";
import type { AlfredpayOfframpMetadata } from "./simulation";

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

export async function registerAlfredpayOfframp(
  ctx: RegisterCtx<AlfredpayOfframpMetadata, AlfredpayOfframpRegistrationInput>
): Promise<RegistrationResult<AlfredpayOfframpRegistrationFacts, AlfredpayOfframpMetadata>> {
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
  const customerId = await resolveAlfredpayCustomerId(ctx.metadata.currency, ctx.authenticatedUser.id);
  const service = AlfredpayApiService.getInstance();
  const toCurrency = ctx.metadata.currency as unknown as AlfredpayFiatCurrency;
  const freshQuote = await service.createOfframpQuote({
    chain: AlfredpayChain.MATIC,
    fromAmount: new Big(ctx.metadata.inputAmountDecimal as unknown as string).toString(),
    fromCurrency: ALFREDPAY_ONCHAIN_CURRENCY,
    metadata: { businessId: "vortex", customerId },
    paymentMethodType: AlfredpayPaymentMethodType.BANK,
    toCurrency
  } satisfies CreateAlfredpayOfframpQuoteRequest);
  const originalOutput = new Big(ctx.metadata.outputAmountDecimal as unknown as string);
  const freshOutput = new Big(freshQuote.toAmount);
  const originalFee = new Big(ctx.metadata.fee as unknown as string);
  const freshFee = AlfredpayApiService.sumFeesByCurrency(freshQuote.fees, toCurrency);
  if (!freshOutput.eq(originalOutput) || !freshFee.eq(originalFee)) {
    throw new APIError({
      message:
        `Refreshed Alfredpay offramp quote drifted: toAmount original=${originalOutput.toString()} fresh=${freshOutput.toString()}, ` +
        `fee original=${originalFee.toString()} fresh=${freshFee.toString()}. Cannot proceed with offramp order.`,
      status: httpStatus.INTERNAL_SERVER_ERROR
    });
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
