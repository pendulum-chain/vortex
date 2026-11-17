import { BRAND } from "../brand.js";
import { formatCostAmount, formatCostPercent, groupedFees } from "../lib/fee-summary.js";

export function FeeSummary({ rows, total, reserve = 0, basis, currency = "BRL", method = "pix", direction = "BUY", locale = "pt-BR", illustrative = false, subsidy = null }) {
  const en = locale === "en", sell = direction === "SELL", t = (pt, english) => en ? english : pt;
  const model = groupedFees({ rows, total, reserve, currency, method, direction });
  const money = value => formatCostAmount(value, currency, locale);
  const percent = formatCostPercent(model.amount, basis, locale);
  const groups = {
    payment: t("Pagamento e câmbio", "Payment and currency conversion"),
    tradeDelivery: sell ? t("Venda e entrega do valor", "Token sale and delivery") : t("Compra e entrega dos tokens", "Token purchase and delivery"),
    trade: sell ? t("Venda do token", "Token sale") : t("Compra do token", "Token purchase"),
    delivery: t("Transferência e entrega", "Network transfer and delivery"),
    service: t("Serviço Vortex", "Vortex service"),
  };
  const items = {
    ramp: [sell ? t("Recebimento com Pix", "Pix payout") : t("Pagamento com Pix", "Pix payment"), "Avenia"],
    conversion: [sell ? t("Conversão para reais", "Conversion to reais") : t("Conversão para dólar digital", "Conversion to digital dollars"), "Nabla"],
    bridge: [t("Transferência entre redes", "Transfer between networks"), sell ? "Relay · Robinhood Chain → Base" : "Relay · Base → Robinhood Chain"],
    swap: [sell ? t("Venda do token", "Token sale") : t("Compra do token", "Token purchase"), "Uniswap"],
    network: [t("Taxas das transações", "Network transaction fees"), "Base · Robinhood Chain"],
    vortex: [sell ? t("Execução e acompanhamento da sua venda", "Execution and tracking of your sale") : t("Execução e acompanhamento da sua compra", "Execution and tracking of your purchase"), "Vortex"],
  };
  const title = model.label === "reported" ? t("Taxas informadas", "Reported fees")
    : model.label === "costs" ? sell ? t("Custos da venda", "Sale costs") : t("Custos da compra", "Purchase costs")
    : sell ? t("Taxas da venda", "Sale fees") : t("Taxas da compra", "Purchase fees");
  const included = model.label === "costs" ? t("já incluídos", "included") : t("já incluídas", "included");
  const deducted = model.label === "costs" ? t("já descontados", "already deducted") : t("já descontadas", "already deducted");
  return <details className="fee-summary">
    <summary>
      <span className="fee-summary__label">{title}, {sell ? deducted : included}</span>
      <span className="fee-summary__value">
        <span className="fee-summary__amount">{money(model.amount)}{percent && <small> ({percent})</small>}</span>
        <span className="fee-summary__toggle"><span className="fee-summary__show">{t("Ver detalhes", "Show details")}</span><span className="fee-summary__hide">{t("Ocultar detalhes", "Hide details")}</span></span>
      </span>
    </summary>
    <div className="fee-summary__body">
      {model.groups.map(group => <section className="fee-summary__group" key={group.id} data-fee-group={group.id}>
        <h3><span>{groups[group.id]}</span><span>{money(group.amount)}</span></h3>
        {group.items.length === 1 ? <p className="fee-summary__note" data-cost-id={group.items[0].id}>{group.id === "service" ? items[group.items[0].id][0] : items[group.items[0].id][1]}{group.items[0].includedIn === "rate" && <> · {t("já refletido no preço", "already reflected in the price")}</>}</p> : <dl>{group.items.map(item => <div key={item.id} data-cost-id={item.id}>
          <dt>{items[item.id][0]} <small>{items[item.id][1]}{item.includedIn === "rate" && <> · {t("já refletido no preço", "already reflected in the price")}</>}</small></dt>
          <dd>{money(item.amount)}</dd>
        </div>)}</dl>}
      </section>)}
      <p className="fee-summary__note">{t("Os valores acima já estão incluídos na cotação. Não são cobrados de novo.", "These costs are included in your quote. They are not charged again.")} {t(`A ${BRAND.name} não adiciona outra taxa.`, `${BRAND.name} adds no extra fee.`)}</p>
      {!model.complete && <p className="fee-summary__note" role="note">{t("Detalhamento parcial: o total acima mostra as taxas informadas. Custos não discriminados permanecem desconhecidos; não significam custo zero.", "Partial breakdown: the total above shows reported fees. Costs that are not itemized remain unknown; they do not mean zero cost.")}</p>}
      {model.hasPriceEffects && <p className="fee-summary__note">{t("Alguns valores já estão no preço de conversão ou negociação e podem aumentar ou reduzir o custo. Não são uma taxa adicional.", "Some amounts are already in the conversion or trading price and can increase or reduce the cost. They are not an additional charge.")}</p>}
      {Number.isFinite(Number(subsidy?.amountFiat)) && Number(subsidy?.amountFiat) > 0 && <p className="fee-summary__note" data-cost-id="subsidy">{t("Desconto já aplicado ao câmbio:", "Discount already applied to the conversion:")} {money(Number(subsidy.amountFiat))}. {t("Não é descontado novamente do total.", "It is not subtracted from the total again.")}</p>}
      {illustrative && <p className="fee-summary__note">{t("Valores ilustrativos, não tarifas atuais dos provedores.", "Illustrative amounts, not current provider tariffs.")}</p>}
    </div>
  </details>;
}

export function ReserveBalance({ amount, currency = "BRL", locale = "pt-BR" }) {
  if (!(amount > 0)) return null;
  const en = locale === "en";
  return <div className="reserve-balance" data-cost-id="reserve">
    <p><b>{en ? "Balance for future network fees" : "Saldo para futuras taxas de rede"}</b><small>{en ? "Taken from your payment, it stays yours, in your wallet. It is not a fee charged." : "Sai do valor pago e continua seu, na sua carteira. Não é uma taxa cobrada."}<br />{en ? "Held as ETH on Robinhood Chain." : "Reservado como ETH na Robinhood Chain."}</small></p>
    <strong>{formatCostAmount(amount, currency, locale)}</strong>
  </div>;
}
