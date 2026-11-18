import { FeeSummary } from "./FeeSummary.jsx";
import { groupedFees } from "../lib/fee-summary.js";
import { quoteProviderCosts } from "../lib/provider-costs.js";

const costRows = quote => quoteProviderCosts(quote.rawQuote, { reserve: quote.gasReserve }).rows;

/** A sell's gross: its payout plus the cost headline FeeSummary shows, so gross minus costs is the payout on
 * screen. A complete breakdown's headline also counts the price effects already inside the payout. */
export const sellGross = (quote, { currency = "BRL", method = "pix" } = {}) =>
  (currency === "USDC" ? quote.usdcAmount : quote.brlAmount)
  + groupedFees({ rows: costRows(quote), total: quote.fees.total, reserve: quote.gasReserve?.brl || 0, currency, method, direction: "SELL" }).amount;

export function QuoteCosts({ quote }) {
  return <FeeSummary rows={costRows(quote)}
    total={quote.fees.total} reserve={quote.gasReserve?.brl || 0}
    basis={quote.direction === "SELL" ? sellGross(quote) : quote.brlAmount}
    direction={quote.direction} illustrative={quote.simulated} subsidy={quote.rawQuote.nablaFeeSubsidy} />;
}

export function UsdcQuoteCosts({ quote, locale = "en" }) {
  return <FeeSummary rows={quote.costs.filter(cost => cost.id !== "reserve").map(cost => ({ id: cost.id, amount: Number(cost.raw) / 1e6, includedIn: "fees" }))}
    total={Number(quote.totalFeesRaw) / 1e6} reserve={Number(quote.costs.find(cost => cost.id === "reserve")?.raw || 0) / 1e6}
    basis={Number(quote.grossRaw) / 1e6} currency="USDC" method="usdc" direction={quote.direction} locale={locale} illustrative />;
}

export function LiveUsdcCosts({ quote, locale = "en" }) {
  return <FeeSummary rows={costRows(quote)}
    total={quote.fees.total} reserve={quote.gasReserve?.brl || 0}
    basis={quote.direction === "SELL" ? sellGross(quote, { currency: "USDC", method: "usdc" }) : quote.usdcAmount}
    currency="USDC" method="usdc" direction={quote.direction} locale={locale} />;
}
