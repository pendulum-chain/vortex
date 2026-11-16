import { FeeSummary } from "./FeeSummary.jsx";
import { quoteProviderCosts } from "../lib/provider-costs.js";

export function QuoteCosts({ quote }) {
  return <FeeSummary rows={quoteProviderCosts(quote.rawQuote, { reserve: quote.gasReserve }).rows}
    total={quote.fees.total} reserve={quote.gasReserve?.brl || 0}
    basis={quote.direction === "SELL" ? quote.brlAmount + quote.fees.total : quote.brlAmount}
    direction={quote.direction} illustrative={quote.simulated} subsidy={quote.rawQuote.nablaFeeSubsidy} />;
}

export function UsdcQuoteCosts({ quote, locale = "en" }) {
  return <FeeSummary rows={quote.costs.filter(cost => cost.id !== "reserve").map(cost => ({ id: cost.id, amount: Number(cost.raw) / 1e6, includedIn: "fees" }))}
    total={Number(quote.totalFeesRaw) / 1e6} reserve={Number(quote.costs.find(cost => cost.id === "reserve")?.raw || 0) / 1e6}
    basis={Number(quote.grossRaw) / 1e6} currency="USDC" method="usdc" direction={quote.direction} locale={locale} illustrative />;
}

export function LiveUsdcCosts({ quote, locale = "en" }) {
  return <FeeSummary rows={quoteProviderCosts(quote.rawQuote, { reserve: quote.gasReserve }).rows}
    total={quote.fees.total} reserve={quote.gasReserve?.brl || 0}
    basis={quote.direction === "SELL" ? quote.usdcAmount + quote.fees.total : quote.usdcAmount}
    currency="USDC" method="usdc" direction={quote.direction} locale={locale} />;
}
