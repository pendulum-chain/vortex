import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Modal } from "../components/Modal.jsx";
import { LiveUsdcCosts } from "../components/QuoteCosts.jsx";
import { Notice } from "../components/ui.jsx";
import { formatTokensEn, formatUsdc } from "../lib/international.js";
import { formatTokenAmount } from "../lib/token.js";
import { BASE_USDC } from "../lib/vortex-stocks.js";
import { decimalRaw, usdcPriceChanged } from "../lib/live-usdc.js";

// Funding stays in the user's Base wallet. A fresh review and explicit confirmation precede every
// new permit. Reopening an already registered operation reuses its durable checkpoints.
export default function LiveUsdcFlow({ token, auth, runtime, direction = "BUY", resume, initialAmount, onClose, onSettled }) {
  const pt = runtime.locale !== "en", t = (en, br) => pt ? br : en;
  const money = (value, digits = 6) => formatUsdc(value, digits, pt ? "pt-BR" : "en-US");
  const api = runtime.usdc, adapter = api.adapter, owner = auth.address;
  const saved = runtime.fundingIntents.get(owner);
  const draft = saved?.symbol === token.symbol && saved.direction === direction ? saved : null;
  const [amount, setAmount] = useState(String(draft?.amount ?? initialAmount ?? (direction === "BUY" ? "100" : "0.1")));
  const [step, setStep] = useState(resume ? "resume" : draft ? "funding" : "amount");
  const [quote, setQuote] = useState(draft?.quote ?? null), [ramp, setRamp] = useState(null);
  const [balance, setBalance] = useState(null), [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [email, setEmail] = useState(auth.user?.email ?? ""), [code, setCode] = useState(""), [sent, setSent] = useState(false);
  const [returnStep, setReturnStep] = useState(resume ? "resume" : "amount");
  const lock = useRef(false), finished = useRef(false), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const sessionReady = () => runtime.verification.hasSession({ email, privyDid: auth.user?.privyDid });
  const errorText = e => {
    if (e?.status === 401 || e?.code === "AUTH_REQUIRED") { setReturnStep(ramp || resume ? "resume" : step); setStep("otp"); }
    if (pt) return e?.message || "Não foi possível continuar. Seus fundos permanecem na carteira ou na operação indicada abaixo.";
    const messages = { RAMP_IN_PROGRESS: "You already have an unfinished order. Resume it before starting another.", INVALID_FEES: "The costs could not be verified. Refresh the quote.", INVALID_QUOTE: "This quote is unavailable. Get a fresh quote.", INSUFFICIENT_BALANCE: "The confirmed balance is insufficient. Wait for your transfer or reduce the amount.", SELL_EXPIRED: "The confirmation window ended. Keep the operation reference if an authorization was already sent.", MAINTENANCE_ACTIVE: "Execution is temporarily paused. Keep this order and try again later.", MAINTENANCE_STATUS_UNAVAILABLE: "We could not verify service availability. Try again shortly.", WRONG_ROUTE: "The route does not match your order. No new authorization was signed.", WALLET_NOT_READY: "Your wallet is still being prepared. Try again shortly.", AUTH_REQUIRED: "Verify your email to continue." };
    if (e?.code === 4001 || /rejected|denied/i.test(e?.message ?? "")) return "Wallet confirmation cancelled. You can resume this same order.";
    return messages[e?.code] || "We could not continue. Keep your order reference and retry this same order. No new order will be registered while it is unfinished.";
  };
  async function run(fn) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try { await fn(); } catch (e) { if (alive.current) setError(errorText(e)); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  async function freshQuote() {
    const listing = await adapter.getAvailability({ force: true });
    if (!listing[token.symbol]?.[direction === "BUY" ? "buy" : "sell"]) throw Object.assign(new Error(t("This route is temporarily unavailable.", "Esta rota está indisponível no momento.")), { code: "TOKEN_UNAVAILABLE" });
    const q = direction === "BUY" ? await adapter.quoteBuy({ symbol: token.symbol, brlAmount: amount, walletAddress: owner }) : await adapter.quoteSell({ symbol: token.symbol, tokenAmount: amount });
    if (usdcPriceChanged(quote, q)) setNotice(t("The price or costs changed beyond your earlier limits. Review this new quote before authorizing anything.", "O preço ou os custos passaram dos limites anteriores. Revise esta nova cotação antes de autorizar."));
    setQuote(q); setAccepted(false); return q;
  }
  const prepare = () => run(async () => {
    if (!sessionReady()) { setReturnStep("amount"); setStep("otp"); return; }
    await freshQuote(); setBalance(await api.refreshBalance(owner)); setStep("review");
  });
  useEffect(() => {
    if (!api.enabled || step !== "funding") return;
    let current = true;
    const update = () => api.refreshBalance(owner).then(v => { if (current) setBalance(v); }).catch(() => { if (current) { setBalance(null); setError(t("The Base balance is unavailable. Wait before sending more funds.", "Não foi possível consultar o saldo na Base. Aguarde antes de enviar mais fundos.")); } });
    update(); const timer = setInterval(update, 5000); return () => { current = false; clearInterval(timer); };
  }, [step, api, owner]);
  useEffect(() => {
    if (!ramp?.id || step !== "processing") return;
    let current = true, polling = false;
    const update = async () => {
      if (polling) return; polling = true;
      try {
        const next = await adapter.getRamp(ramp.id, { walletAddress: owner });
        if (!current) return;
        setRamp(next);
        if (next.classification === "success") { setStep("success"); if (!finished.current) { finished.current = true; onSettled?.(); } }
        else if (next.classification === "failure") setStep("issue");
      } catch (e) { if (current) setError(errorText(e)); }
      finally { polling = false; }
    };
    update(); const timer = setInterval(update, 4000); return () => { current = false; clearInterval(timer); };
  }, [ramp?.id, step]);
  async function continueRamp(id) {
    const wallet = await runtime.walletSeam(auth, direction === "BUY" ? runtime.baseChain : undefined);
    const next = await adapter.resumeSell({ rampId: id, walletAddress: owner, wallet });
    setRamp(next);
    if (next.classification === "success") { setStep("success"); onSettled?.(); return; }
    if (next.classification === "failure") { setStep("issue"); return; }
    if (next.currentPhase === "initial") await adapter.startRamp(id, { walletAddress: owner });
    setStep("processing");
  }
  const confirm = () => run(async () => {
    if (!accepted || !quote) return;
    if (!sessionReady()) { setReturnStep("review"); setStep("otp"); return; }
    const confirmed = await api.refreshBalance(owner); setBalance(confirmed);
    if (direction === "BUY" && confirmed < decimalRaw(quote.rawQuote.inputAmount)) {
      runtime.fundingIntents.save(owner, { symbol: token.symbol, direction, amount, quote, expiresAt: Date.now() + 30 * 60_000 });
      setStep("funding"); return;
    }
    if (quote.expiresAt - Date.now() < 15000) { await freshQuote(); setNotice(t("Quote refreshed. Review and confirm again.", "Cotação atualizada. Revise e confirme novamente.")); return; }
    const wallet = await runtime.walletSeam(auth, direction === "BUY" ? runtime.baseChain : undefined);
    setStep("resume");
    const register = direction === "BUY" ? adapter.registerBuy : adapter.registerSell;
    const next = await register({ quote, walletAddress: owner, wallet, onRegistered: r => { setRamp(r); runtime.fundingIntents.clear(owner); } });
    setRamp(next); runtime.fundingIntents.clear(owner);
    await adapter.startRamp(next.id, { walletAddress: owner }); setStep("processing");
  });
  const retry = () => run(async () => {
    if (!sessionReady()) { setReturnStep("resume"); setStep("otp"); return; }
    const active = runtime.activeRampStore.get(owner), id = ramp?.id || resume?.rampId || active?.rampId;
    if (id) await continueRamp(id); else { setStep("amount"); await freshQuote(); setStep("review"); }
  });
  const required = quote && direction === "BUY" ? decimalRaw(quote.rawQuote.inputAmount) : 0n;
  const remaining = balance == null ? null : required > balance ? required - balance : 0n;
  const out = q => q.direction === "BUY" ? `${(pt ? formatTokenAmount(q.tokenAmount) : formatTokensEn(q.tokenAmount))} ${token.symbol}` : money(q.usdcAmount, 6);
  return <Modal title={`${direction === "BUY" ? t("Buy", "Comprar") : t("Sell", "Vender")} ${token.symbol} · USDC`} lang={pt ? "pt-BR" : "en"} closeLabel={t("Close", "Fechar")} onClose={onClose} closeDisabled={busy} wide stepKey={step}>
    <div className="flow-section">
      {!api.enabled && !resume && !ramp ? <Notice title={t("USDC is coming soon", "USDC em breve")}>{t("Base USDC funding is being enabled. No payment or signature is requested.", "Estamos preparando o pagamento com USDC na Base. Nenhum pagamento ou assinatura será solicitado.")}</Notice> : <>
        <p className="eyebrow">{t("Native USDC on Base · Direct Relay + Uniswap", "USDC nativo na Base · Relay + Uniswap direto")}</p>
        {notice && <Notice tone="info">{notice}</Notice>}
        {step === "otp" && <>
          <h3>{t("Verify your email", "Confirme seu e-mail")}</h3><p>{t("Use the code sent by Vortex to link this order to your account.", "Use o código enviado pela Vortex para vincular esta operação à sua conta.")}</p>
          <label className="field-label" htmlFor="usdc-email">E-mail</label><input className="input" id="usdc-email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} />
          <button className="btn btn--secondary btn--full" disabled={busy} onClick={() => run(async () => { await runtime.verification.requestOtp(email); setSent(true); })}>{t("Send code", "Enviar código")}</button>
          {sent && <><label className="field-label" htmlFor="usdc-code">{t("Email code", "Código do e-mail")}</label><input className="input" id="usdc-code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value)} /><button className="btn btn--primary btn--full" disabled={busy} onClick={() => run(async () => { await runtime.verification.verifyOtp(email, code, { privyDid: auth.user?.privyDid }); setStep(returnStep); })}>{t("Verify", "Confirmar")}</button></>}
        </>}
        {step === "amount" && <>
          <label className="field-label" htmlFor="live-usdc-amount">{direction === "BUY" ? t("How much would you like to invest?", "Quanto você quer investir?") : t("How many tokens would you like to sell?", "Quantos tokens você quer vender?")}</label>
          <div className="amount-input"><input id="live-usdc-amount" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value.replace(",", "."))} /><span>{direction === "BUY" ? "USDC" : token.symbol}</span></div>
          {direction === "BUY" && <div className="quick-values">{[25,100,250,1000].map(n => <button key={n} onClick={() => setAmount(String(n))}>{n} USDC</button>)}</div>}
          <button className="btn btn--primary btn--full btn--lg" disabled={busy} onClick={prepare}>{t("Get quote", "Ver cotação")}</button>
          <p className="hint">{t("Minimum order: 10 USDC. You receive a Stock Token, not the underlying share. Bank payments are planned.", "Mínimo de 10 USDC. Você recebe um token de ação, não a ação. O Pix continua disponível como outra forma de pagamento.")}</p>
        </>}
        {step === "review" && quote && <>
          <dl className="breakdown"><div><dt>{direction === "BUY" ? t("You pay", "Você paga") : t("You sell", "Você vende")}</dt><dd>{direction === "BUY" ? money(quote.usdcAmount, 6) : `${(pt ? formatTokenAmount(quote.tokenAmount) : formatTokensEn(quote.tokenAmount))} ${token.symbol}`}</dd></div><div className="is-total"><dt>{t("Estimated receipt", "Recebimento estimado")}</dt><dd>{out(quote)}</dd></div></dl>
          <LiveUsdcCosts quote={quote} locale={runtime.locale} />
          <p className="hint">{t("Your wallet signs one exact-amount authorization. Vortex pays execution gas. An exchange or sending wallet can charge separately.", "Sua carteira assina uma autorização do valor exato. A Vortex cobre o gas da execução. A corretora ou carteira de origem pode cobrar à parte.")}</p>
          <label className="check"><input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} /><span>{t("I reviewed the amount, costs and estimated receipt.", "Revisei o valor, os custos e o recebimento estimado.")}</span></label>
          <button className="btn btn--primary btn--full btn--lg" disabled={busy || !accepted} onClick={confirm}>{direction === "BUY" && balance != null && balance < required ? t("Continue to USDC payment", "Continuar para pagar com USDC") : t("Confirm and authorize", "Confirmar e autorizar")}</button>
          <button className="back-button" disabled={busy} onClick={prepare}>{t("Refresh quote", "Atualizar cotação")}</button><button className="back-button" disabled={busy} onClick={() => { setQuote(null); setStep("amount"); }}>{t("Change amount", "Alterar valor")}</button>
        </>}
        {step === "funding" && quote && <>
          <h3>{t("Add Base USDC to your wallet", "Envie USDC na Base para sua carteira")}</h3>
          <Notice tone="warning">{t("Send only native USDC on Base to the address below. Other tokens or networks cannot fund this order.", "Envie apenas USDC nativo na rede Base para o endereço abaixo. Outros tokens ou redes não servem para esta operação.")}</Notice>
          <div className="qr"><QRCodeSVG value={owner} size={180} title={t("Your wallet address on Base", "Endereço da sua carteira na Base")} /></div>
          <code className="wallet-address" style={{ overflowWrap: "anywhere" }}>{owner}</code>
          <button className="btn btn--secondary btn--full" onClick={() => run(async () => { await navigator.clipboard.writeText(owner); setNotice(t("Address copied. Select USDC and the Base network in your sending app.", "Endereço copiado. Selecione USDC e a rede Base no aplicativo de origem.")); })}>{t("Copy wallet address", "Copiar endereço da carteira")}</button>
          <dl className="breakdown"><div><dt>{t("Confirmed balance", "Saldo confirmado")}</dt><dd>{balance == null ? "—" : money(Number(balance) / 1e6, 6)}</dd></div><div><dt>{t("Still needed", "Falta enviar")}</dt><dd>{remaining == null ? "—" : money(Number(remaining) / 1e6, 6)}</dd></div></dl>
          <p className="hint">{t("We wait for two Base confirmations. Partial, excess and late deposits stay in your wallet. Funding alone never starts a purchase. Review a fresh quote after funds arrive.", "Aguardamos duas confirmações na Base. Valores parciais, extras ou atrasados ficam na sua carteira. O depósito não inicia uma compra. Revise uma nova cotação após o recebimento.")}</p>
          <small className="hint">USDC · Base · {BASE_USDC.address}</small>
          <button className="btn btn--primary btn--full" disabled={busy || remaining !== 0n} onClick={prepare}>{t("Review fresh quote", "Revisar nova cotação")}</button>
          <button className="back-button" onClick={() => { runtime.fundingIntents.clear(owner); onClose(); }}>{t("Cancel order · keep USDC", "Cancelar pedido · manter USDC")}</button>
        </>}
        {step === "resume" && <><h3>{t("Continue this order", "Continuar esta operação")}</h3><p>{t("An unfinished order is saved on this device. We check its state before requesting any authorization.", "Esta operação está salva neste aparelho. Conferimos o status antes de solicitar uma autorização.")}</p><button className="btn btn--primary btn--full" disabled={busy} onClick={retry}>{busy ? t("Preparing…", "Preparando…") : t("Resume order", "Retomar operação")}</button></>}
        {step === "processing" && <div className="result"><span className="spinner" /><h3>{t("Your order is executing", "Sua operação está em andamento")}</h3><p>{direction === "BUY" ? "Relay → Uniswap → Stock Token" : "Uniswap → Relay → Base USDC"}</p><p>{t("You can close this window and resume this same order.", "Você pode fechar esta janela e retomar a mesma operação.")}</p></div>}
        {step === "success" && <div className="result"><div className="result__seal">✓</div><h3>{direction === "BUY" ? t("Your Stock Tokens have arrived", "Seus tokens chegaram") : t("Your USDC is on Base", "Seu USDC está na Base")}</h3><p className="result__amount">{direction === "SELL" ? money(ramp?.usdcAmount, 6) : `${(pt ? formatTokenAmount(ramp?.tokenAmount ?? "0") : formatTokensEn(ramp?.tokenAmount))} ${token.symbol}`}</p><button className="btn btn--primary btn--full" onClick={onClose}>{t("Done", "Concluir")}</button></div>}
        {step === "issue" && <Notice tone="warning" title={t("This order needs attention", "Esta operação precisa de atenção")}>{t("Do not register another order to recover these funds. Keep the reference below for support.", "Não crie outra operação para recuperar estes fundos. Guarde o código abaixo para o suporte.")}</Notice>}
      </>}
      {error && <p className="field-error" role="alert">{error}</p>}
      {(ramp?.id || resume?.rampId) && <p className="op-ref">{t("Order reference", "Código da operação")}: <code>{ramp?.id || resume.rampId}</code></p>}
    </div>
  </Modal>;
}
