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
          {quote.gasReserve && <div><dt>Reserva de ETH<small>Fica na carteira para pagar a rede nas próximas vendas</small></dt><dd>{formatBRL(quote.gasReserve.brl)}<small>Já incluída nas taxas</small></dd></div>}
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
