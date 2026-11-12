import { formatBRL, formatNumber } from "../format.js";
import { BRAND } from "../brand.js";
import { formatUsdc } from "../lib/international.js";
import { quoteProviderCosts, costBps } from "../lib/provider-costs.js";

export function QuoteCosts({ quote }) {
  const details = quoteProviderCosts(quote.rawQuote, { reserve: quote.gasReserve, simulated: quote.simulated });
  const basis = quote.direction === "BUY" ? quote.brlAmount : quote.brlAmount + quote.fees.total;
  const rows = quote.direction === "SELL"
    ? ["swap", "bridge", "conversion", "ramp", "vortex", "network"].map((id) => details.rows.find((row) => row.id === id))
    : details.rows;
  return (
    <details className="provider-costs">
      <summary>Provedores e custos <span>{quote.simulated ? "Simulação" : "Cotação"}</span><small>Relay + Uniswap · sem taxa adicional {BRAND.name}</small></summary>
      <div className="provider-costs__body">
        <p className="hint">{details.routing === "direct" ? "Rota direta · Relay + Uniswap" : "Rota ainda não confirmada pelo provedor"}</p>
        <dl className="breakdown provider-costs__rows">
          {rows.map((row) => <div key={row.id} data-cost-id={row.id}>
            <dt><span>{row.name}</span><small>{row.label}</small></dt>
            <dd>{row.amount === null ? "Não discriminado" : formatBRL(row.amount)}
              <small>{row.amount === null ? "Detalhe não informado na cotação" : `${formatNumber(costBps(row.amount, basis), 2)} bps · ${row.includedIn === "rate" ? "no câmbio" : "nas taxas"}`}</small>
            </dd>
          </div>)}
          <div data-cost-id="product"><dt>Taxa adicional {BRAND.name}<small>Sem cobrança além do serviço Vortex e dos provedores</small></dt><dd>{formatBRL(details.extraProductFee)}<small>0 bps</small></dd></div>
          {quote.gasReserve && <div><dt>Reserva de ETH<small>Fica na sua carteira como ETH na Robinhood Chain</small></dt><dd>{formatBRL(quote.gasReserve.brl)}<small>Já incluída nas taxas</small></dd></div>}
          {quote.rawQuote.nablaFeeSubsidy && <div data-cost-id="subsidy"><dt>Subsídio da taxa Nabla<small>Taxa DEX efetiva: {Number(quote.rawQuote.nablaFeeSubsidy.effectiveFeeBps).toFixed(2)} bps</small></dt><dd>−{formatBRL(Number(quote.rawQuote.nablaFeeSubsidy.amountFiat))}<small>Já refletido no câmbio acima</small></dd></div>}
          {details.identifiedTotal !== null && <div className="is-total"><dt>Custos identificados<small>Taxas, efeitos de preço informados e reserva de ETH</small></dt><dd>{formatBRL(details.identifiedTotal)}<small>{formatNumber(costBps(details.identifiedTotal, basis), 2)} bps</small></dd></div>}
        </dl>
        <p className="hint">Os valores acima já estão refletidos no que você paga e recebe. Não são cobrados novamente.{!details.complete && " O detalhamento está incompleto: taxas informadas não representam necessariamente todo o efeito de câmbio e negociação."}</p>
        {quote.simulated && <p className="hint">Provedores planejados e valores ilustrativos. A cotação real pode variar.</p>}
      </div>
    </details>
  );
}

export function UsdcQuoteCosts({ quote }) {
  const basis = Number(quote.grossRaw);
  const costs = quote.direction === "SELL" ? ["swap", "bridge", "vortex", "network", "reserve"].map((id) => quote.costs.find((c) => c.id === id)) : quote.costs;
  return <details className="provider-costs">
    <summary>Providers and costs <span>Simulation</span><small>Direct Relay + Uniswap · no additional product fee</small></summary>
    <div className="provider-costs__body">
      <dl className="breakdown provider-costs__rows">
        {costs.map((cost) => <div key={cost.id} data-cost-id={cost.id}><dt><span>{cost.provider}</span><small>{cost.label}</small></dt><dd>{formatUsdc(Number(cost.raw) / 1e6, 4)}<small>{(Number(cost.raw) / basis * 10_000).toFixed(2)} bps · included</small></dd></div>)}
        <div data-cost-id="product"><dt>Additional {BRAND.name} fee</dt><dd>0.00 USDC<small>0 bps</small></dd></div>
        <div className="is-total"><dt>Total included costs</dt><dd>{formatUsdc(Number(quote.totalFeesRaw) / 1e6, 4)}<small>{(Number(quote.totalFeesRaw) / basis * 10_000).toFixed(2)} bps</small></dd></div>
      </dl>
      <p className="hint">All listed costs are already reflected in your quoted output. The ETH reserve is included once and remains in your wallet. Your sending wallet or exchange may charge separately.</p>
      <p className="hint">Illustrative provider costs, not live tariffs. The Vortex fee is our only service revenue.</p>
    </div>
  </details>;
}

export function LiveUsdcCosts({ quote, locale = "en" }) {
  const pt = locale !== "en", t = (en, br) => pt ? br : en;
  const money = (value, digits = 6) => formatUsdc(value, digits, pt ? "pt-BR" : "en-US");
  const bps = value => new Intl.NumberFormat(pt ? "pt-BR" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  const details = quoteProviderCosts(quote.rawQuote, { reserve: quote.gasReserve });
  const basis = quote.direction === "BUY" ? quote.usdcAmount : quote.usdcAmount + quote.fees.total;
  const names = { bridge: ["Relay", "Base ↔ Robinhood Chain"], swap: ["Uniswap", "USDG ↔ Stock Token"], vortex: ["Vortex", t("Service and execution", "Serviço e execução")], network: [t("Networks", "Redes"), t("Gas on Base and Robinhood Chain", "Gas na Base e na Robinhood Chain")] };
  const rows = (quote.direction === "SELL" ? ["swap", "bridge", "vortex", "network"] : ["bridge", "swap", "vortex", "network"]).map(id => details.rows.find(r => r.id === id));
  const identified = details.complete ? quote.fees.total + details.rows.filter(r => r.includedIn === "rate").reduce((sum,r) => sum + r.amount, 0) : null;
  return <details className="provider-costs"><summary>{t("Providers and costs", "Provedores e custos")}<span>{t("Live quote", "Cotação atual")}</span><small>{t("Direct Relay + Uniswap · no additional product fee", "Relay + Uniswap direto · sem taxa adicional do produto")}</small></summary><div className="provider-costs__body"><dl className="breakdown provider-costs__rows">
    {rows.map(row => <div key={row.id} data-cost-id={row.id}><dt>{names[row.id][0]}<small>{names[row.id][1]}</small></dt><dd>{row.amount == null ? t("Not itemized", "Não discriminado") : money(row.amount, 6)}<small>{row.amount == null ? "—" : `${bps(costBps(row.amount,basis))} bps · ${row.includedIn === "rate" ? t("in execution price", "no preço de execução") : t("in fees", "nas taxas")}`}</small></dd></div>)}
    <div data-cost-id="product"><dt>{t("Additional product fee", "Taxa adicional do produto")}</dt><dd>0 USDC<small>0 bps</small></dd></div>
    {quote.gasReserve && <div data-cost-id="reserve"><dt>{t("ETH reserve in your wallet", "Reserva de ETH na sua carteira")}</dt><dd>{money(quote.gasReserve.brl, 6)}<small>{t("Already inside network fees", "Já incluída nas taxas de rede")}</small></dd></div>}
    <div><dt>{t("Reported fees", "Taxas informadas")}</dt><dd>{money(quote.fees.total, 6)}</dd></div>
    {identified != null && <div className="is-total"><dt>{t("Identified costs including price effects", "Custos identificados, incluindo efeitos de preço")}</dt><dd>{money(identified, 6)}<small>{bps(costBps(identified,basis))} bps</small></dd></div>}
  </dl><p className="hint">{t("All amounts are already reflected in the quote and are not deducted again. Price effects can be favorable or unfavorable. Your sending wallet or exchange can charge separately. The Vortex fee is our only service revenue.", "Os valores já estão refletidos na cotação e não são descontados de novo. Os efeitos de preço podem ser favoráveis ou desfavoráveis. A carteira ou corretora de origem pode cobrar à parte. A taxa Vortex é nossa única receita de serviço.")}</p></div></details>;
}
