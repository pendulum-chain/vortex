import {
  ALFREDPAY_ERC20_DECIMALS,
  ALFREDPAY_EVM_TOKEN,
  ALFREDPAY_ONCHAIN_CURRENCY,
  AlfredpayApiService,
  AlfredpayChain,
  AlfredpayFiatCurrency,
  AlfredpayPaymentMethodType,
  CreateAlfredpayOnrampQuoteRequest,
  FiatToken,
  multiplyByPowerOfTen,
  Networks,
  RampCurrency
} from "@vortexfi/shared";
import Big from "big.js";
import { resolveAlfredpayQuoteCustomerId } from "../../../alfredpay-customer";
import { calculateFees } from "../../core/fees";
import { evmIO } from "../../core/io";
import { defineContext, type SerializableBig } from "../../core/metadata";
import type { PhaseCtx, PhaseIO, PhaseResult } from "../../core/types";

export type AlfredpayOnrampFiat = typeof FiatToken.USD | typeof FiatToken.MXN | typeof FiatToken.COP | typeof FiatToken.ARS;

export interface AlfredpayMintMetadata {
  currency: AlfredpayOnrampFiat;
  expirationDate: Date;
  fee: SerializableBig;
  inputAmountDecimal: SerializableBig;
  inputAmountRaw: string;
  outputAmountDecimal: SerializableBig;
  outputAmountRaw: string;
  quoteId: string;
}

export const AlfredpayMintContext = defineContext<AlfredpayMintMetadata>()("alfredpayMint");

export async function simulateAlfredpayMint(
  input: PhaseIO<AlfredpayOnrampFiat, "fiat">,
  ctx: PhaseCtx
): Promise<PhaseResult<PhaseIO<typeof ALFREDPAY_EVM_TOKEN, typeof Networks.Polygon>, AlfredpayMintMetadata>> {
  const customerId = await resolveAlfredpayQuoteCustomerId(input.token, ctx.request.userId);
  const quoteRequest: CreateAlfredpayOnrampQuoteRequest = {
    chain: AlfredpayChain.MATIC,
    fromAmount: input.amount.toString(),
    fromCurrency: input.token as unknown as AlfredpayFiatCurrency,
    metadata: { businessId: "vortex", customerId },
    paymentMethodType: AlfredpayPaymentMethodType.BANK,
    toCurrency: ALFREDPAY_ONCHAIN_CURRENCY
  };
  const quote = await AlfredpayApiService.getInstance().createOnrampQuote(quoteRequest);
  const inputAmountDecimal = new Big(quote.fromAmount);
  const outputAmountDecimal = new Big(quote.toAmount);
  const fee = AlfredpayApiService.sumFeesByCurrency(quote.fees, input.token as unknown as AlfredpayFiatCurrency);
  const outputAmountRaw = multiplyByPowerOfTen(outputAmountDecimal, ALFREDPAY_ERC20_DECIMALS).toFixed(0, 0);
  const fees = await calculateFees(ctx, {
    anchor: { amount: fee.toString(), currency: input.token as RampCurrency },
    network: { amount: "0", currency: ALFREDPAY_EVM_TOKEN as RampCurrency }
  });

  ctx.addNote(`AlfredpayMint: ${input.amount.toFixed()} ${input.token} -> ${outputAmountDecimal.toFixed()} USDT on Polygon`);
  const expiresAt = new Date(quote.expiration);
  return {
    expiresAt,
    fees,
    metadata: {
      currency: input.token,
      expirationDate: expiresAt,
      fee,
      inputAmountDecimal,
      inputAmountRaw: multiplyByPowerOfTen(inputAmountDecimal, 2).toFixed(0, 0),
      outputAmountDecimal,
      outputAmountRaw,
      quoteId: quote.quoteId
    },
    output: evmIO(ALFREDPAY_EVM_TOKEN, Networks.Polygon, outputAmountDecimal, outputAmountRaw)
  };
}
