import {
  ALFREDPAY_ERC20_DECIMALS,
  ALFREDPAY_ERC20_TOKEN,
  ALFREDPAY_EVM_TOKEN,
  ALFREDPAY_ONCHAIN_CURRENCY,
  AlfredpayApiService,
  AlfredpayChain,
  type AlfredpayFeeType,
  type AlfredpayFiatCurrency,
  AlfredpayPaymentMethodType,
  AlfredpayTradeLimitError,
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
import logger from "../../../../../../config/logger";
import { MAX_FINAL_SETTLEMENT_SUBSIDY_USD } from "../../../../../../constants/constants";
import { type FiatExchangeRateSource, priceFeedService } from "../../../../priceFeed.service";
import { resolveAlfredpayQuoteCustomerId } from "../../../../quote/alfredpay-customer";
import { getAdjustedDifference, getUsdDenominatedInputAmount, resolveDiscountPartner } from "../../core/discount";
import { getEvmFeeTotalRawFromUsd } from "../../core/fee-distribution";
import { overrideFees } from "../../core/fees";
import { evmIO } from "../../core/io";
import { defineContext, type SerializableBig } from "../../core/metadata";
import { getEvmBridgeQuote } from "../../core/squidrouter";
import type { PhaseCtx, PhaseIO, PhaseResult } from "../../core/types";

export interface AlfredpayOfframpMetadata {
  adjustedDifference: SerializableBig;
  adjustedTargetDiscount: SerializableBig;
  bridgeInputAmountRaw: string;
  bridgeOutputAmountDecimal: SerializableBig;
  bridgeOutputAmountRaw: string;
  currency: FiatToken;
  expirationDate: Date;
  /** Guaranteed Polygon USDT amount. Introduced by context schema 3 / flow v4. */
  executableBridgeOutputRaw: string;
  fee: SerializableBig;
  fromNetwork: EvmNetworks;
  fromToken: `0x${string}`;
  inputAmountDecimal: SerializableBig;
  inputAmountRaw: string;
  network: typeof Networks.Polygon;
  outputAmountDecimal: SerializableBig;
  outputAmountRaw: string;
  pricing: {
    customer: {
      allInRate: SerializableBig;
      inputAmountUsd: SerializableBig;
      referenceDifferenceBps: SerializableBig;
    };
    provider: {
      baseCurrency: typeof ALFREDPAY_ONCHAIN_CURRENCY;
      feeAmount: SerializableBig;
      fees: Array<{ amount: string; currency: string; type: AlfredpayFeeType }>;
      grossRate: SerializableBig;
      grossReferenceDifferenceBps: SerializableBig;
      netRate: SerializableBig;
      netReferenceDifferenceBps: SerializableBig;
      quoteCurrency: FiatToken;
      quotedAt: Date;
      source: "alfredpay";
    };
    reference: {
      baseCurrency: "USD";
      observedAt: Date;
      quoteCurrency: FiatToken;
      rate: SerializableBig;
      source: FiatExchangeRateSource;
    };
  };
  quoteId: string;
  subsidyAmountDecimal: SerializableBig;
  subsidyAmountRaw: string;
  token: typeof ALFREDPAY_EVM_TOKEN;
  toToken: `0x${string}`;
}

/** Executable Squid minimum and quote-bound settlement subsidy. */
export const AlfredpayOfframpContext = defineContext<AlfredpayOfframpMetadata>()("alfredpayOfframp", 3);

export const ALFREDPAY_MIN_EXECUTION_LIFETIME_MS = 2 * 60 * 1000;
export const ALFREDPAY_MIN_QUOTE_LIFETIME_MS = 10 * 1000;

export function hasSafeAlfredpayQuoteLifetime(expiration: string): boolean {
  const expiresAt = Date.parse(expiration);
  return Number.isFinite(expiresAt) && expiresAt > Date.now() + ALFREDPAY_MIN_QUOTE_LIFETIME_MS;
}

export function hasSafeAlfredpayExecutionLifetime(expiration: string, nowMs = Date.now()): boolean {
  const expiresAt = Date.parse(expiration);
  return Number.isFinite(expiresAt) && expiresAt > nowMs + ALFREDPAY_MIN_EXECUTION_LIFETIME_MS;
}

export function getAlfredpayExecutableBridgeOutputRaw(
  metadata: Pick<AlfredpayOfframpMetadata, "executableBridgeOutputRaw" | "inputAmountRaw" | "subsidyAmountRaw">,
  feesUsd: Parameters<typeof getEvmFeeTotalRawFromUsd>[0]
): string {
  const derivedMinimumRaw = new Big(metadata.inputAmountRaw)
    .plus(getEvmFeeTotalRawFromUsd(feesUsd, ALFREDPAY_ERC20_DECIMALS))
    .minus(metadata.subsidyAmountRaw)
    .toFixed(0);
  if (!new Big(metadata.executableBridgeOutputRaw).eq(derivedMinimumRaw)) {
    throw new Error(
      `Alfredpay executable bridge minimum mismatch: persisted=${metadata.executableBridgeOutputRaw}, derived=${derivedMinimumRaw}`
    );
  }
  return metadata.executableBridgeOutputRaw;
}

function directAlfredpaySettlementQuote(amountDecimal: string) {
  const outputAmountDecimal = new Big(amountDecimal);
  const amountRaw = multiplyByPowerOfTen(outputAmountDecimal, ALFREDPAY_ERC20_DECIMALS).toFixed(0, Big.roundDown);

  return {
    fromToken: ALFREDPAY_ERC20_TOKEN,
    inputAmountRaw: amountRaw,
    minimumOutputAmountDecimal: outputAmountDecimal,
    minimumOutputAmountRaw: amountRaw,
    outputAmountDecimal,
    outputAmountRaw: amountRaw,
    toToken: ALFREDPAY_ERC20_TOKEN
  };
}

export function simulateAlfredpayOfframp<FromToken extends EvmToken, FromNetwork extends EvmNetworks>(
  fromToken: FromToken,
  fromNetwork: FromNetwork
) {
  return async (
    input: PhaseIO<FromToken, FromNetwork>,
    ctx: PhaseCtx
  ): Promise<PhaseResult<PhaseIO<FiatToken, "fiat">, AlfredpayOfframpMetadata>> => {
    const bridge =
      fromNetwork === Networks.Polygon && fromToken === ALFREDPAY_EVM_TOKEN
        ? directAlfredpaySettlementQuote(ctx.request.inputAmount)
        : await getEvmBridgeQuote({
            amountDecimal: ctx.request.inputAmount,
            fromNetwork,
            inputCurrency: fromToken as OnChainToken,
            outputCurrency: ALFREDPAY_EVM_TOKEN,
            toNetwork: Networks.Polygon
          });
    const executableBridgeOutputDecimal = bridge.minimumOutputAmountDecimal;
    const executableBridgeOutputRaw = bridge.minimumOutputAmountRaw;
    if (!ctx.fees?.usd) {
      throw new Error("AlfredpayOfframp: Missing fee snapshot");
    }
    const referenceRateSnapshot = await priceFeedService.getUsdToFiatExchangeRateSnapshot(
      ctx.request.outputCurrency as RampCurrency
    );
    const referenceRate = new Big(referenceRateSnapshot.rate);
    if (referenceRate.lte(0)) {
      throw new Error(`AlfredpayOfframp: Invalid reference rate ${referenceRate.toString()}`);
    }
    const partner = await resolveDiscountPartner(ctx as never, RampDirection.SELL);
    const targetDiscount = partner?.targetDiscount ?? 0;
    const maxSubsidy = partner?.maxSubsidy ?? 0;
    const inputAmountUsd = await getUsdDenominatedInputAmount(
      Object.assign({}, ctx, { evmToEvm: { outputAmountDecimal: executableBridgeOutputDecimal } }) as never
    );
    if (!inputAmountUsd.eq(ctx.request.inputAmount)) {
      ctx.addNote(
        `AlfredpayOfframp: valued input ${ctx.request.inputAmount} ${ctx.request.inputCurrency} at ${inputAmountUsd.toFixed(6)} USD for discount calculation`
      );
    }
    const adjustedDifference = getAdjustedDifference(partner);
    const adjustedTargetDiscount = new Big(targetDiscount).plus(adjustedDifference);
    const subsidyEnabled = new Big(targetDiscount).gt(0);
    const expectedOutput = inputAmountUsd.mul(referenceRate).mul(new Big(1).plus(adjustedTargetDiscount));
    if (expectedOutput.lte(0)) {
      throw new Error(`AlfredpayOfframp: Invalid target output ${expectedOutput.toString()}`);
    }
    const feeReserveRaw = new Big(getEvmFeeTotalRawFromUsd(ctx.fees.usd, ALFREDPAY_ERC20_DECIMALS));
    const bridgeOutputRaw = new Big(executableBridgeOutputRaw);
    const baselineProviderInputRaw = bridgeOutputRaw.minus(feeReserveRaw);
    if (baselineProviderInputRaw.lte(0)) {
      throw new Error("AlfredpayOfframp: Platform fees consume the full bridged amount");
    }

    const customerId = await resolveAlfredpayQuoteCustomerId(ctx.request.outputCurrency, ctx.request.userId);
    const toCurrency = ctx.request.outputCurrency as unknown as AlfredpayFiatCurrency;
    const alfredpay = AlfredpayApiService.getInstance();
    const createProviderQuote = (amount: { fromAmount: string } | { toAmount: string }) =>
      alfredpay.createOfframpQuote({
        ...amount,
        chain: AlfredpayChain.MATIC,
        fromCurrency: ALFREDPAY_ONCHAIN_CURRENCY,
        metadata: { businessId: "vortex", customerId },
        paymentMethodType: AlfredpayPaymentMethodType.BANK,
        toCurrency
      });
    const providerInputRaw = (amount: string): Big => {
      const raw = multiplyByPowerOfTen(amount, ALFREDPAY_ERC20_DECIMALS);
      if (!raw.eq(raw.round(0, Big.roundDown))) {
        throw new Error(`AlfredpayOfframp: Provider input ${amount} exceeds USDT precision`);
      }
      return raw;
    };
    const providerInputDecimal = (raw: Big): string => raw.div(new Big(10).pow(ALFREDPAY_ERC20_DECIMALS)).toString();
    const matchesProviderPair = (quote: Awaited<ReturnType<typeof createProviderQuote>>): boolean =>
      (quote.chain === undefined || quote.chain === AlfredpayChain.MATIC) &&
      quote.fromCurrency === ALFREDPAY_ONCHAIN_CURRENCY &&
      quote.toCurrency === toCurrency;
    const createFixedInputQuote = async (raw: Big) => {
      const requestedFromAmount = providerInputDecimal(raw);
      const quote = await createProviderQuote({ fromAmount: requestedFromAmount });
      if (!matchesProviderPair(quote) || !new Big(quote.fromAmount).eq(requestedFromAmount)) {
        throw new Error(
          `AlfredpayOfframp: Fixed-input quote drifted from ${requestedFromAmount} ${ALFREDPAY_ONCHAIN_CURRENCY} to ${quote.fromAmount} ${quote.fromCurrency}/${quote.toCurrency}`
        );
      }
      return quote;
    };

    const configuredPartnerCapUsd = expectedOutput.mul(maxSubsidy).div(referenceRate);
    const partnerCapUsd = configuredPartnerCapUsd.gt(0) ? configuredPartnerCapUsd : new Big(0);
    const partnerCapRaw = multiplyByPowerOfTen(partnerCapUsd, ALFREDPAY_ERC20_DECIMALS).round(0, Big.roundDown);
    const runtimeCapRaw = multiplyByPowerOfTen(MAX_FINAL_SETTLEMENT_SUBSIDY_USD, ALFREDPAY_ERC20_DECIMALS);
    const allowedSubsidyRaw = partnerCapRaw.lt(runtimeCapRaw) ? partnerCapRaw : runtimeCapRaw;
    const requestedTargetOutput = expectedOutput.round(2, Big.roundUp);

    let providerQuote: Awaited<ReturnType<typeof createProviderQuote>> | undefined;
    let targetRequiredSubsidyRaw = new Big(0);
    let targetWasCapped = false;
    let providerLimitBoundCap = false;
    let providerMaximumInput: string | undefined;
    let requiredSubsidyUsd: string | undefined;
    if (subsidyEnabled) {
      let targetQuote: Awaited<ReturnType<typeof createProviderQuote>> | undefined;
      try {
        targetQuote = await createProviderQuote({ toAmount: requestedTargetOutput.toFixed(2) });
      } catch (error) {
        if (
          !(error instanceof AlfredpayTradeLimitError) ||
          error.kind !== "above" ||
          error.fromCurrency !== ALFREDPAY_ONCHAIN_CURRENCY
        ) {
          throw error;
        }
        const providerMaximumInputRaw = multiplyByPowerOfTen(error.quantity, ALFREDPAY_ERC20_DECIMALS).round(0, Big.roundDown);
        if (providerMaximumInputRaw.lt(baselineProviderInputRaw)) {
          throw error;
        }
        const vortexCappedInputRaw = baselineProviderInputRaw.plus(allowedSubsidyRaw);
        const cappedInputRaw = providerMaximumInputRaw.lt(vortexCappedInputRaw)
          ? providerMaximumInputRaw
          : vortexCappedInputRaw;
        providerLimitBoundCap = providerMaximumInputRaw.lt(vortexCappedInputRaw);
        providerMaximumInput = providerInputDecimal(providerMaximumInputRaw);
        const providerMaximumSubsidyRaw = providerMaximumInputRaw.plus(feeReserveRaw).minus(bridgeOutputRaw);
        requiredSubsidyUsd = `>${(providerMaximumSubsidyRaw.gt(0) ? providerMaximumSubsidyRaw : new Big(0))
          .div(new Big(10).pow(ALFREDPAY_ERC20_DECIMALS))
          .toString()}`;
        targetWasCapped = true;
        providerQuote = await createFixedInputQuote(cappedInputRaw);
      }
      if (targetQuote) {
        if (!matchesProviderPair(targetQuote) || new Big(targetQuote.toAmount).lt(requestedTargetOutput)) {
          throw new Error(
            `AlfredpayOfframp: Exact-output quote returned ${targetQuote.fromCurrency}/${targetQuote.toCurrency} ${targetQuote.toAmount}, below requested ${requestedTargetOutput.toFixed(2)} ${ctx.request.outputCurrency}`
          );
        }
        const targetProviderInputRaw = providerInputRaw(targetQuote.fromAmount);
        targetRequiredSubsidyRaw = targetProviderInputRaw.plus(feeReserveRaw).minus(bridgeOutputRaw);
        requiredSubsidyUsd = (targetRequiredSubsidyRaw.gt(0) ? targetRequiredSubsidyRaw : new Big(0))
          .div(new Big(10).pow(ALFREDPAY_ERC20_DECIMALS))
          .toString();

        if (targetRequiredSubsidyRaw.lte(0)) {
          providerQuote = await createFixedInputQuote(baselineProviderInputRaw);
        } else if (targetRequiredSubsidyRaw.lte(allowedSubsidyRaw)) {
          providerQuote = targetQuote;
        } else {
          targetWasCapped = true;
          providerQuote = await createFixedInputQuote(baselineProviderInputRaw.plus(allowedSubsidyRaw));
        }
      }
    } else {
      providerQuote = await createFixedInputQuote(baselineProviderInputRaw);
    }
    if (!providerQuote) {
      throw new Error("AlfredpayOfframp: Provider quote selection did not produce a quote");
    }
    const expirationDate = new Date(providerQuote.expiration);
    if (!hasSafeAlfredpayQuoteLifetime(providerQuote.expiration)) {
      throw new Error(
        `AlfredpayOfframp: Provider quote lifetime is too short for safe registration (${providerQuote.expiration})`
      );
    }

    const providerInputAmountRaw = providerInputRaw(providerQuote.fromAmount);
    const providerInput = providerInputAmountRaw.div(new Big(10).pow(ALFREDPAY_ERC20_DECIMALS));
    const requiredSubsidyRaw = providerInputAmountRaw.plus(feeReserveRaw).minus(bridgeOutputRaw);
    const subsidyAmountRaw = requiredSubsidyRaw.gt(0) ? requiredSubsidyRaw : new Big(0);
    if (subsidyAmountRaw.gt(allowedSubsidyRaw) && subsidyEnabled) {
      throw new Error(
        `AlfredpayOfframp: Provider input requires ${subsidyAmountRaw.toString()} subsidy raw units, above the quoted cap ${allowedSubsidyRaw.toString()}`
      );
    }
    const outputAmount = new Big(providerQuote.toAmount);
    if (subsidyEnabled && !targetWasCapped && outputAmount.lt(requestedTargetOutput)) {
      throw new Error(
        `AlfredpayOfframp: Selected provider quote returned ${outputAmount.toString()}, below the uncapped target ${requestedTargetOutput.toFixed(2)}`
      );
    }
    if (targetWasCapped && outputAmount.lt(requestedTargetOutput)) {
      const capReason = providerLimitBoundCap
        ? "provider"
        : partnerCapRaw.eq(runtimeCapRaw)
          ? "partner-and-runtime"
          : partnerCapRaw.lt(runtimeCapRaw)
            ? "partner"
            : "runtime";
      logger.warn("ALFREDPAY_OFFRAMP_TARGET_DISCOUNT_CAPPED", {
        adjustedTargetDiscount: adjustedTargetDiscount.toString(),
        allowedSubsidyUsd: allowedSubsidyRaw.div(new Big(10).pow(ALFREDPAY_ERC20_DECIMALS)).toString(),
        appliedSubsidyUsd: subsidyAmountRaw.div(new Big(10).pow(ALFREDPAY_ERC20_DECIMALS)).toString(),
        capReason,
        deliveredOutput: outputAmount.toString(),
        fiatCurrency: ctx.request.outputCurrency,
        inputAmountUsd: inputAmountUsd.toString(),
        partnerId: partner?.id,
        providerMaximumInput,
        requestedTargetOutput: requestedTargetOutput.toString(),
        requiredSubsidyUsd
      });
      ctx.addNote(
        `AlfredpayOfframp: target output ${requestedTargetOutput.toString()} capped to ${outputAmount.toString()} ${ctx.request.outputCurrency}`
      );
    }
    const providerGrossRate = new Big(providerQuote.rate);
    const providerNetRate = outputAmount.div(providerInput);
    const customerAllInRate = outputAmount.div(inputAmountUsd);
    const providerFee = AlfredpayApiService.sumFeesByCurrency(
      providerQuote.fees,
      ctx.request.outputCurrency as unknown as AlfredpayFiatCurrency
    );
    const inputAmountRaw = providerInputAmountRaw.toFixed(0);
    const fees = await overrideFees(ctx, {
      anchor: { amount: providerFee.toString(), currency: ctx.request.outputCurrency as RampCurrency },
      network: { amount: "0", currency: ALFREDPAY_EVM_TOKEN as RampCurrency }
    });
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
        // Preserve the v3/schema-2 meaning of these persisted fields: Squid's
        // estimated output. Executable cap math above uses the guaranteed
        // minimum, which transaction preparation re-derives from persisted
        // provider input, fee reserve, and subsidy without reinterpreting them.
        bridgeOutputAmountDecimal: bridge.outputAmountDecimal,
        bridgeOutputAmountRaw: bridge.outputAmountRaw,
        currency: ctx.request.outputCurrency as FiatToken,
        executableBridgeOutputRaw,
        expirationDate,
        fee: providerFee,
        fromNetwork,
        fromToken: bridge.fromToken,
        inputAmountDecimal: providerInput,
        inputAmountRaw,
        network: Networks.Polygon,
        outputAmountDecimal: outputAmount,
        outputAmountRaw: multiplyByPowerOfTen(outputAmount, 2).toFixed(0, 0),
        pricing: {
          customer: {
            allInRate: customerAllInRate,
            inputAmountUsd,
            referenceDifferenceBps: customerAllInRate.div(referenceRate).minus(1).mul(10_000)
          },
          provider: {
            baseCurrency: ALFREDPAY_ONCHAIN_CURRENCY,
            feeAmount: providerFee,
            fees: providerQuote.fees.map(({ amount, currency, type }) => ({ amount, currency, type })),
            grossRate: providerGrossRate,
            grossReferenceDifferenceBps: providerGrossRate.div(referenceRate).minus(1).mul(10_000),
            netRate: providerNetRate,
            netReferenceDifferenceBps: providerNetRate.div(referenceRate).minus(1).mul(10_000),
            quoteCurrency: ctx.request.outputCurrency as FiatToken,
            quotedAt: ctx.now,
            source: "alfredpay"
          },
          reference: {
            baseCurrency: "USD",
            observedAt: referenceRateSnapshot.observedAt,
            quoteCurrency: ctx.request.outputCurrency as FiatToken,
            rate: referenceRate,
            source: referenceRateSnapshot.source
          }
        },
        quoteId: providerQuote.quoteId,
        subsidyAmountDecimal: subsidyAmountRaw.div(new Big(10).pow(ALFREDPAY_ERC20_DECIMALS)),
        subsidyAmountRaw: subsidyAmountRaw.toFixed(0),
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
