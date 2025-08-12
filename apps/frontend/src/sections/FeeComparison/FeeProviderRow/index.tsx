import { BundledPriceResult, FiatToken, RampDirection } from "@packages/shared";
import Big from "big.js";
import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Skeleton } from "../../../components/Skeleton";
import { RampParameters, useEventsContext } from "../../../contexts/events";
import { cn } from "../../../helpers/cn";
import { useQuote } from "../../../stores/ramp/useQuoteStore";
import { useRampDirection } from "../../../stores/rampDirectionStore";
import { formatPrice } from "../helpers";
import { PriceProviderDetails } from "../priceProviders";
import { MINIMUM_BRL_BUY_AMOUNT } from "./utils";

interface FeeProviderRowProps {
  provider: PriceProviderDetails;
  isBestRate: boolean;
  bestPrice: Big;
  isLoading: boolean;
  result?: BundledPriceResult;
  amountRaw: string;
  sourceAssetSymbol: string;
  targetAssetSymbol: string;
}

export function FeeProviderRow({
  provider,
  isBestRate,
  bestPrice,
  isLoading,
  result,
  amountRaw,
  sourceAssetSymbol,
  targetAssetSymbol
}: FeeProviderRowProps) {
  const { t } = useTranslation();
  const rampDirection = useRampDirection();
  const isBRLOnramp = rampDirection === RampDirection.BUY && sourceAssetSymbol === FiatToken.BRL;

  const { schedulePrice } = useEventsContext();
  // The vortex price is sometimes lagging behind the amount (as it first has to be calculated asynchronously)
  // We keep a reference to the previous vortex price to avoid spamming the server with the same quote.
  const prevVortexPrice = useRef<Big | null>(null);
  const prevProviderPrice = useRef<Big | null>(null);
  const quote = useQuote();

  const vortexPrice = useMemo(() => (quote ? Big(quote.outputAmount) : Big(0)), [quote]);

  const amount = useMemo(() => Big(amountRaw || "0"), [amountRaw]);

  // Determine if there's an error from the result
  const error = result?.status === "rejected" ? result.reason : undefined;

  // Calculate provider price based on the result or vortex price
  const providerPrice = useMemo(() => {
    if (provider.name === "vortex") return vortexPrice.gt(0) ? vortexPrice : undefined;

    if (result?.status === "fulfilled" && result.value.quoteAmount) {
      // Use quoteAmount which represents what the user will receive
      return Big(result.value.quoteAmount.toString());
    }

    return undefined;
  }, [provider.name, vortexPrice, result]);

  const priceDiff = useMemo(() => {
    if (isLoading || error || !providerPrice) return;
    return providerPrice.minus(bestPrice);
  }, [isLoading, error, providerPrice, bestPrice]);

  // Update the parent component with the price
  useEffect(() => {
    if (isLoading) return;

    const currentPrice = providerPrice ? providerPrice : new Big(0);
    if (prevProviderPrice.current?.eq(currentPrice)) return;

    // No need to call onPriceFetched as the parent now manages prices
    prevProviderPrice.current = currentPrice;
  }, [isLoading, providerPrice]);

  useEffect(() => {
    if (isLoading || !providerPrice || error) return;
    if (prevVortexPrice.current?.eq(vortexPrice)) return;

    const parameters: RampParameters = {
      from_amount: amount.toFixed(2),
      from_asset: sourceAssetSymbol,
      to_amount: vortexPrice.toFixed(2),
      to_asset: targetAssetSymbol
    };

    schedulePrice(provider.name, providerPrice.toFixed(2, 0), parameters, true);
    prevVortexPrice.current = vortexPrice;
  }, [
    isLoading,
    error,
    providerPrice,
    vortexPrice,
    amount,
    sourceAssetSymbol,
    targetAssetSymbol,
    provider.name,
    schedulePrice
  ]);

  return (
    <div className={cn(isBestRate && "rounded-md bg-green-500/10 py-1")}>
      {isBestRate && (
        <div className="ml-4 pb-1 text-green-700 text-sm italic">{t("sections.feeComparison.table.bestRate")}</div>
      )}
      <div className="flex w-full items-center justify-between">
        <a className="ml-4 flex w-full grow items-center gap-4" href={provider.href} rel="noreferrer" target="_blank">
          {provider.icon}
        </a>
        <div className="flex w-full grow items-center justify-center gap-4">
          {isLoading ? (
            <Skeleton className="mb-2 h-10 w-20" />
          ) : (
            <div className="flex flex-col items-center">
              <div className="flex w-full justify-end">
                {error || !providerPrice ? (
                  <>
                    <span className="font-bold text-md">N/A</span>
                    {isBRLOnramp && <span className="ml-1">(min {MINIMUM_BRL_BUY_AMOUNT[provider.name]}BRL)</span>}
                  </>
                ) : (
                  <>
                    <span className="text-right font-bold text-md">{`${formatPrice(providerPrice)} ${targetAssetSymbol}`}</span>
                  </>
                )}
              </div>
              {priceDiff && priceDiff.lt(0) && (
                <div className="flex w-full justify-end text-red-600">
                  <span className="text-right font-bold">{`${formatPrice(priceDiff)} ${targetAssetSymbol}`}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
