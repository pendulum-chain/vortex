import { useId, useState } from "react";
import { ArrowRight, CheckCircle } from "./icons.js";
import { STOCK_TOKENS, findStock } from "../lib/stocks.js";
import { estimatePurchase, PREVIEW_DEFAULT, PREVIEW_MINIMUM } from "../lib/purchase-preview.js";
import { formatBRL, formatNumber } from "../format.js";
import { formatTokensEn, formatUsdc } from "../lib/international.js";
import { formatTokenAmount } from "../lib/token.js";
import { BRAND } from "../brand.js";

const PROVIDERS = { avenia: "Avenia · Pix", nabla: "Nabla", relay: "Relay", uniswap: "Uniswap", vortex: "Vortex", network: "Rede / Networks", reserve: "Reserva de ETH / ETH reserve" };

export function PurchasePreview({ prices = {}, locale = "pt-BR", symbol = null, onContinue, canContinue = () => true, id }) {
  const en = locale === "en", uid = useId();
  const [selected, setSelected] = useState(symbol || "NVDA");
  const [method, setMethod] = useState(en ? "usdc" : "pix");
  const [amount, setAmount] = useState(PREVIEW_DEFAULT[method]);
  const [reviewed, setReviewed] = useState(false);
  const [error, setError] = useState("");
  const token = findStock(symbol || selected);
  const preview = estimatePurchase({ symbol: token.symbol, method, amount, locale }, prices[token.symbol]?.[method === "pix" ? "brl" : "usd"]);
  const money = value => method === "pix" ? formatBRL(value) : formatUsdc(value, 4);
  const available = preview && canContinue(preview.selection);
  const change = fn => { fn(); setReviewed(false); setError(""); };
  const next = async () => {
    if (!preview || !available) return;
    try { await onContinue(preview.selection); } catch (e) { setError(en ? "We could not keep your selection for sign-in. Please try again." : e.message); }
  };
  return <section className="card purchase-preview" id={id} aria-label={en ? "Prepare your purchase" : "Prepare sua compra"}>
    <div className="purchase-preview__head"><p className="eyebrow">{en ? "Your first purchase" : "Sua primeira compra"}</p><span className="preview-badge"><CheckCircle size={14} aria-hidden="true" />{en ? "No sign-up needed" : "Sem cadastro"}</span></div>
    <h2>{en ? "How much would you like to start with?" : "Com quanto você quer começar?"}</h2>
    {symbol ? <p className="preview-company">{en ? token.underlyingName : token.namePt} <span>{token.symbol} · Stock Token</span></p> : <label className="field-label" htmlFor={`${uid}-stock`}>{en ? "Choose a company or ETF" : "Escolha uma empresa ou ETF"}<select className="text-input" id={`${uid}-stock`} value={selected} onChange={e => change(() => setSelected(e.target.value))}>{STOCK_TOKENS.map(t => <option key={t.symbol} value={t.symbol}>{en ? t.underlyingName : t.namePt} · {t.symbol}</option>)}</select></label>}
    {!en && <div className="preview-methods" role="group" aria-label="Como você quer pagar?">{["pix", "usdc"].filter(value => value === "pix" || canContinue({ method: value })).map(value => <button type="button" key={value} aria-pressed={method === value} onClick={() => change(() => { setMethod(value); setAmount(PREVIEW_DEFAULT[value]); })}>{value === "pix" ? "Pix · em reais" : "USDC · na Base"}</button>)}</div>}
    {en && <p className="preview-method-label">Pay with USDC on Base</p>}
    <label className="field-label" htmlFor={`${uid}-amount`}>{en ? "Your investment amount" : "Quanto você quer investir?"}</label>
    <div className="preview-amount"><span>{method === "pix" ? "R$" : "USDC"}</span><input id={`${uid}-amount`} inputMode={method === "pix" ? "numeric" : "decimal"} autoComplete="off" maxLength={18} value={amount} onChange={e => change(() => setAmount(e.target.value))} aria-describedby={`${uid}-minimum`} /></div>
    <p className="preview-minimum" id={`${uid}-minimum`}>{en ? `Start with ${PREVIEW_MINIMUM[method]} USDC. You can buy part of a token.` : `A partir de ${method === "pix" ? formatBRL(PREVIEW_MINIMUM.pix, 0) : "10 USDC"}. Você pode comprar uma fração do token.`}</p>
    <div className="quick-values preview-values">{(method === "pix" ? [100, 500, 1000] : [10, 100, 250]).map(value => <button type="button" key={value} aria-pressed={Number(amount.replace(",", ".")) === value} onClick={() => change(() => setAmount(String(value)))}>{method === "pix" ? formatBRL(value, 0) : `${value} USDC`}</button>)}</div>
    {reviewed && preview && <div className="preview-result" aria-live="polite">
      <p className="preview-result__label">{en ? "Your estimate" : "Sua estimativa"}</p>
      <dl className="breakdown"><div><dt>{en ? "You pay" : "Você paga"}</dt><dd>{money(preview.amount)}</dd></div><div><dt>{en ? "Estimated costs, included" : "Custos estimados, já incluídos"}</dt><dd>{money(preview.total)} <small>({en ? (preview.total / preview.amount * 100).toFixed(2) : formatNumber(preview.total / preview.amount * 100, 2)}%)</small></dd></div><div className="is-total"><dt>{en ? "You receive, approximately" : "Você recebe, aproximadamente"}</dt><dd>≈ {en ? formatTokensEn(preview.tokenAmount) : formatTokenAmount(preview.tokenAmount)} {token.symbol}</dd></div></dl>
      <details className="preview-costs"><summary>{en ? "See providers and costs" : "Ver provedores e custos"}</summary><dl>{preview.costs.map(cost => <div key={cost.provider}><dt>{cost.provider === "network" ? en ? "Network fees" : "Taxas de rede" : cost.provider === "reserve" ? en ? "ETH reserve in your wallet" : "Reserva de ETH na sua carteira" : PROVIDERS[cost.provider]}</dt><dd>{money(cost.amount)}</dd></div>)}<div><dt>{en ? `Extra ${BRAND.name} fee` : `Taxa extra ${BRAND.name}`}</dt><dd>{money(0)}</dd></div></dl></details>
      <p className="preview-note">{en ? "Reference price and illustrative costs, including a small ETH reserve that stays in your wallet. Your final quote is checked after sign-in and shown before any payment. Your sending wallet or exchange may charge separately." : "Preço de referência e custos ilustrativos, com uma pequena reserva de ETH que fica na sua carteira. A cotação final é atualizada depois que você entrar e aparece antes de qualquer pagamento."}</p>
    </div>}
    {error && <p className="field-error" role="alert">{error}</p>}
    {!reviewed ? <button className="btn btn--primary btn--full btn--lg" type="button" disabled={!preview} onClick={() => setReviewed(true)}>{en ? "See purchase costs" : "Ver custos da compra"}<ArrowRight size={18} aria-hidden="true" /></button>
      : <button className="btn btn--primary btn--full btn--lg" type="button" disabled={!available} onClick={next}>{en ? "Continue with USDC" : method === "pix" ? "Continuar com Pix" : "Continuar com USDC"}<ArrowRight size={18} aria-hidden="true" /></button>}
    {!preview && <p className="preview-note" role="status">{en ? "Enter a valid amount. A current reference price is needed for your estimate." : "Informe um valor válido. Precisamos de um preço de referência disponível para calcular a estimativa."}</p>}
    {reviewed && preview && available === false && <p className="preview-note" role="status">{en ? "Purchases are coming soon. You can explore estimates without sending money." : "Compra em breve. Você já pode simular sem enviar dinheiro."}</p>}
    <p className="preview-assurance">{en ? "You receive a Stock Token, not the share. No payment is made at this step." : "Você recebe um token que acompanha a ação. Nenhum pagamento é feito nesta etapa."}</p>
  </section>;
}
