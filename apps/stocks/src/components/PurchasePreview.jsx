import { useId, useState } from "react";
import { ArrowRight, CheckCircle } from "./icons.js";
import { STOCK_TOKENS, findStock } from "../lib/stocks.js";
import { estimatePurchase, PREVIEW_DEFAULT, PREVIEW_MINIMUM } from "../lib/purchase-preview.js";
import { formatBRL } from "../format.js";
import { FeeSummary, ReserveBalance } from "./FeeSummary.jsx";
import { formatCostAmount } from "../lib/fee-summary.js";
import { DIRECT_PROVIDERS } from "../lib/provider-costs.js";
import { formatTokensEn } from "../lib/international.js";
import { formatTokenAmount } from "../lib/token.js";

export function PurchasePreview({ prices = {}, locale = "pt-BR", symbol = null, onContinue, canContinue = () => true, id }) {
  const en = locale === "en", uid = useId();
  const [selected, setSelected] = useState(symbol || "NVDA");
  const [method, setMethod] = useState(en ? "usdc" : "pix");
  const [amount, setAmount] = useState(PREVIEW_DEFAULT[method]);
  const [reviewed, setReviewed] = useState(false);
  const [error, setError] = useState("");
  const token = findStock(symbol || selected);
  const preview = estimatePurchase({ symbol: token.symbol, method, amount, locale }, prices[token.symbol]?.[method === "pix" ? "brl" : "usd"]);
  const money = value => formatCostAmount(value, method === "pix" ? "BRL" : "USDC", locale);
  const reserve = preview?.costs.find(cost => cost.provider === "reserve")?.amount || 0;
  const rows = preview?.costs.filter(cost => cost.provider !== "reserve").map(cost => ({ id: DIRECT_PROVIDERS.find(item => item.provider === cost.provider)?.id, amount: cost.amount, includedIn: "fees" })) || [];
  const available = preview && canContinue(preview.selection);
  const change = fn => { fn(); setReviewed(false); setError(""); };
  const next = async () => {
    if (!preview || !available) return;
    try { await onContinue(preview.selection); } catch (e) { setError(en ? "We could not keep your selection for sign-in. Please try again." : e.message); }
  };
  return <section className="card purchase-preview" id={id} aria-label={en ? "Prepare your purchase" : "Prepare sua compra"}>
    <div className="purchase-preview__head"><p className="eyebrow">{en ? "Your first purchase" : "Sua primeira compra"}</p><span className="preview-badge"><CheckCircle size={14} aria-hidden="true" />{en ? "Estimate without an account" : "Estimativa sem cadastro"}</span></div>
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
      <p className="preview-note">{en ? "Illustrative example. Review a fresh quote after signing in, before you pay." : "Exemplo ilustrativo. Confira a cotação atualizada depois de entrar, antes de pagar."}</p>
      <div className="fee-card">
        <dl className="breakdown"><div><dt>{en ? "You pay" : "Você paga"}</dt><dd>{money(preview.amount)}</dd></div></dl>
        <FeeSummary rows={rows} total={preview.total} reserve={reserve} basis={preview.amount} currency={preview.currency} method={method} locale={locale} />
        <ReserveBalance amount={reserve} currency={preview.currency} locale={locale} />
        <dl className="breakdown"><div className="is-total"><dt>{en ? "Amount used to buy your tokens" : "Valor usado para comprar seus tokens"}</dt><dd>{money(preview.net)}<small>≈ {en ? formatTokensEn(preview.tokenAmount) : formatTokenAmount(preview.tokenAmount)} {en ? `${token.symbol} tokens` : `tokens ${token.symbol}`}</small></dd></div></dl>
      </div>
      {method === "usdc" && <p className="preview-note">{en ? "Your sending wallet or exchange may charge separately." : "A carteira ou corretora de origem pode cobrar à parte."}</p>}
    </div>}
    {error && <p className="field-error" role="alert">{error}</p>}
    {!reviewed ? <button className="btn btn--primary btn--full btn--lg" type="button" disabled={!preview} onClick={() => setReviewed(true)}>{en ? "See purchase costs" : "Ver custos da compra"}<ArrowRight size={18} aria-hidden="true" /></button>
      : <button className="btn btn--primary btn--full btn--lg" type="button" disabled={!available} onClick={next}>{en ? "Continue with USDC" : method === "pix" ? "Continuar com Pix" : "Continuar com USDC"}<ArrowRight size={18} aria-hidden="true" /></button>}
    {!preview && <p className="preview-note" role="status">{en ? "Enter a valid amount. A current reference price is needed for your estimate." : "Informe um valor válido. Precisamos de um preço de referência disponível para calcular a estimativa."}</p>}
    {reviewed && preview && available === false && <p className="preview-note" role="status">{en ? "Purchases are coming soon. You can explore estimates without sending money." : "Compra em breve. Você já pode simular sem enviar dinheiro."}</p>}
    <p className="preview-assurance">{en ? "You receive a Stock Token, not the share. No payment is made at this step." : "Você recebe um token que acompanha a ação. Nenhum pagamento é feito nesta etapa."}</p>
  </section>;
}
