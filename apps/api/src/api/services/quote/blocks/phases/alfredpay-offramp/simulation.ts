import {
  ALFREDPAY_ERC20_DECIMALS,
  ALFREDPAY_EVM_TOKEN,
  ALFREDPAY_ONCHAIN_CURRENCY,
  AlfredpayApiService,
  AlfredpayChain,
  type AlfredpayFiatCurrency,
  AlfredpayPaymentMethodType,
  type EvmNetworks,
  type EvmToken,
  type FiatToken,
  multiplyByPowerOfTen,
  Networks,
  type OnChainToken,
  type RampCurrency,
  RampDirection
} from "@vortexfi/shared";
import Big from "big.js";
import { priceFeedService } from "../../../../priceFeed.service";
import { resolveAlfredpayQuoteCustomerId } from "../../../alfredpay-customer";
import { calculatePreNablaDeductibleFees } from "../../../core/quote-fees";
import { getEvmBridgeQuote } from "../../../core/squidrouter";
import { calculateExpectedOutput, calculateSubsidyAmount, resolveDiscountPartner } from "../../../engines/discount/helpers";
import { calculateFees } from "../../core/fees";
import { evmIO } from "../../core/io";
import { defineContext, type SerializableBig } from "../../core/metadata";
import type { PhaseCtx, PhaseIO, PhaseResult } from "../../core/types";

export interface AlfredpayOfframpMetadata {
  adjustedDifference: SerializableBig;
  adjustedTargetDiscount: SerializableBig;
  bridgeInputAmountRaw: string;
  bridgeOutputAmountDecimal: SerializableBig;
  bridgeOutputAmountRaw: string;
  currency: FiatToken;
  expirationDate: Date;
  fee: SerializableBig;
  fromNetwork: EvmNetworks;
  fromToken: `0x${string}`;
  inputAmountDecimal: SerializableBig;
  inputAmountRaw: string;
  network: typeof Networks.Polygon;
  outputAmountDecimal: SerializableBig;
  outputAmountRaw: string;
  quoteId: string;
  subsidyAmountDecimal: SerializableBig;
  subsidyAmountRaw: string;
  token: typeof ALFREDPAY_EVM_TOKEN;
  toToken: `0x${string}`;
}

export const AlfredpayOfframpContext = defineContext<AlfredpayOfframpMetadata>()("alfredpayOfframp");

export function simulateAlfredpayOfframp<FromToken extends EvmToken, FromNetwork extends EvmNetworks>(
  fromToken: FromToken,
  fromNetwork: FromNetwork
) {
  return async (
    input: PhaseIO<FromToken, FromNetwork>,
    ctx: PhaseCtx
  ): Promise<PhaseResult<PhaseIO<FiatToken, "fiat">, AlfredpayOfframpMetadata>> => {
    const bridge = await getEvmBridgeQuote({
      amountDecimal: ctx.request.inputAmount,
      fromNetwork,
      inputCurrency: fromToken as OnChainToken,
      outputCurrency: ALFREDPAY_EVM_TOKEN,
      rampType: RampDirection.SELL,
      toNetwork: Networks.Polygon
    });
    const { preNablaDeductibleFeeAmount, feeCurrency } = await calculatePreNablaDeductibleFees(
      ctx.request.inputAmount,
      ctx.request.inputCurrency,
      ctx.request.outputCurrency,
      ctx.request.rampType,
      ctx.request.from,
      ctx.request.to,
      ctx.partner?.id || undefined
    );
    const deductibleUsd = new Big(
      await priceFeedService.convertCurrency(
        preNablaDeductibleFeeAmount.toString(),
        feeCurrency,
        ALFREDPAY_ONCHAIN_CURRENCY as unknown as RampCurrency
      )
    );
    const oneUnitInFiat = new Big(
      await priceFeedService.convertCurrency(
        "1",
        ALFREDPAY_ONCHAIN_CURRENCY as unknown as RampCurrency,
        ctx.request.outputCurrency as RampCurrency
      )
    );
    const fiatToUsd = new Big(1).div(oneUnitInFiat);
    const partner = await resolveDiscountPartner(ctx as never, RampDirection.SELL);
    const targetDiscount = partner?.targetDiscount ?? 0;
    const maxSubsidy = partner?.maxSubsidy ?? 0;
    const actualFiat = bridge.outputAmountDecimal.mul(oneUnitInFiat);
    const { expectedOutput, adjustedDifference, adjustedTargetDiscount } = calculateExpectedOutput(
      ctx.request.inputAmount,
      fiatToUsd,
      targetDiscount,
      true,
      partner
    );
    const subsidyFiat = targetDiscount !== 0 ? calculateSubsidyAmount(expectedOutput, actualFiat, maxSubsidy) : new Big(0);
    const providerInput = actualFiat
      .plus(subsidyFiat)
      .div(oneUnitInFiat)
      .minus(deductibleUsd)
      .round(ALFREDPAY_ERC20_DECIMALS, Big.roundDown);
    const customerId = await resolveAlfredpayQuoteCustomerId(ctx.request.outputCurrency, ctx.request.userId);
    const providerQuote = await AlfredpayApiService.getInstance().createOfframpQuote({
      chain: AlfredpayChain.MATIC,
      fromAmount: providerInput.toString(),
      fromCurrency: ALFREDPAY_ONCHAIN_CURRENCY,
      metadata: { businessId: "vortex", customerId },
      paymentMethodType: AlfredpayPaymentMethodType.BANK,
      toCurrency: ctx.request.outputCurrency as unknown as AlfredpayFiatCurrency
    });
    const outputAmount = new Big(providerQuote.toAmount);
    const providerFee = AlfredpayApiService.sumFeesByCurrency(
      providerQuote.fees,
      ctx.request.outputCurrency as unknown as AlfredpayFiatCurrency
    );
    const inputAmountRaw = multiplyByPowerOfTen(providerInput, ALFREDPAY_ERC20_DECIMALS).toFixed(0, 0);
    const fees = await calculateFees(ctx, {
      anchor: { amount: providerFee.toString(), currency: ctx.request.outputCurrency as RampCurrency },
      network: { amount: "0", currency: ALFREDPAY_EVM_TOKEN as RampCurrency }
    });
    const expirationDate = new Date(providerQuote.expiration);
    ctx.addNote(
      `AlfredpayOfframp: ${input.amount.toString()} ${fromToken} -> ${outputAmount.toString()} ${ctx.request.outputCurrency}`
    );
    return {
      expiresAt: expirationDate,
      fees,
      metadata: {
        adjustedDifference,
        adjustedTargetDiscount,
        bridgeInputAmountRaw: bridge.inputAmountRaw,
        bridgeOutputAmountDecimal: bridge.outputAmountDecimal,
        bridgeOutputAmountRaw: bridge.outputAmountRaw,
        currency: ctx.request.outputCurrency as FiatToken,
        expirationDate,
        fee: providerFee,
        fromNetwork,
        fromToken: bridge.fromToken,
        inputAmountDecimal: providerInput,
        inputAmountRaw,
        network: Networks.Polygon,
        outputAmountDecimal: outputAmount,
        outputAmountRaw: multiplyByPowerOfTen(outputAmount, 2).toFixed(0, 0),
        quoteId: providerQuote.quoteId,
        subsidyAmountDecimal: subsidyFiat.div(oneUnitInFiat),
        subsidyAmountRaw: multiplyByPowerOfTen(subsidyFiat.div(oneUnitInFiat), ALFREDPAY_ERC20_DECIMALS).toFixed(0, 0),
        token: ALFREDPAY_EVM_TOKEN,
        toToken: bridge.toToken
      },
      output: evmIO(
        ctx.request.outputCurrency as FiatToken,
        "fiat",
        outputAmount,
        multiplyByPowerOfTen(outputAmount, 2).toFixed(0, 0)
      )
    };
  };
}
