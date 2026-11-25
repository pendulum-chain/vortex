import { useEffect, useRef, useState } from "react";
import { Modal } from "../components/Modal.jsx";
import { ReserveBalance } from "../components/FeeSummary.jsx";
import { formatCostAmount } from "../lib/fee-summary.js";
import { LiveUsdcCosts } from "../components/QuoteCosts.jsx";
import { Notice } from "../components/ui.jsx";
import { errorMessage, needsCode, OtpStep } from "./parts.jsx";
import { formatTokensEn, formatUsdc } from "../lib/international.js";
import { formatTokenAmount } from "../lib/token.js";
import { decimalRaw, usdcPriceChanged } from "../lib/live-usdc.js";
import { CheckoutRoute, UsdcFunding } from "./UsdcFunding.jsx";

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
  const [balanceUnavailable, setBalanceUnavailable] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [sender, setSender] = useState(null), [connecting, setConnecting] = useState(false);
  const [transfer, setTransfer] = useState(() => api.walletFunding?.pending(owner) || null);
  const funding = api.walletFunding;
  const [email, setEmail] = useState(auth.user?.email ?? ""), [code, setCode] = useState(""), [sent, setSent] = useState(false);
  const [returnStep, setReturnStep] = useState(resume ? "resume" : "amount");
  const lock = useRef(false), finished = useRef(false), alive = useRef(true);
  const currentOwner = useRef(owner);
  currentOwner.current = owner;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const sessionReady = () => runtime.verification.hasSession({ email, privyDid: auth.user?.privyDid });
  const enterOtp = next => {
    setSent(false); setCode(""); setReturnStep(next); setStep("otp");
  };
  const errorText = e => {
    if (step !== "otp" && needsCode(e)) enterOtp(ramp || resume ? "resume" : step);
    if (pt) return errorMessage(e, "Não foi possível continuar. Seus fundos permanecem na carteira ou na operação indicada abaixo.");
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
    if (!sessionReady()) { enterOtp("amount"); return; }
    await freshQuote(); setBalance(await api.refreshBalance(owner)); setStep("review");
  });
  useEffect(() => {
    if (!api.enabled || step !== "funding") return;
    let current = true, polling = false;
    const update = async () => {
      if (polling || lock.current) return;
      polling = true;
      try {
        const value = await api.refreshBalance(owner);
        const status = await funding?.check(owner).catch(() => null);
        if (!current || lock.current) return;
        setBalance(value);
        setBalanceUnavailable(false);
        setTransfer(funding?.pending(owner) || null);
        if (status === "reverted") setError(t("The transfer failed on Base. Check your wallet and try again.", "O envio falhou na rede Base. Confira sua carteira e tente novamente."));
      } catch {
        if (current && !lock.current) { setBalance(null); setBalanceUnavailable(true); }
      } finally { polling = false; }
    };
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
    if (!quote) return;
    if (!sessionReady()) { enterOtp("review"); return; }
    const confirmed = await api.refreshBalance(owner); setBalance(confirmed);
    if (direction === "BUY" && confirmed < decimalRaw(quote.rawQuote.inputAmount)) {
      runtime.fundingIntents.save(owner, { symbol: token.symbol, direction, amount, quote, expiresAt: Date.now() + 30 * 60_000 });
      setStep("funding"); return;
    }
    if (!accepted) {
      setNotice(t("Your balance is ready. Review and approve the purchase to continue.", "Seu saldo está disponível. Revise e aprove a compra para continuar."));
      return;
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
    if (!sessionReady()) { enterOtp("resume"); return; }
    const active = runtime.activeRampStore.get(owner), id = ramp?.id || resume?.rampId || active?.rampId;
    if (id) await continueRamp(id); else { setStep("amount"); await freshQuote(); setStep("review"); }
  });
  const required = quote && direction === "BUY" ? decimalRaw(quote.rawQuote.inputAmount) : 0n;
  const remaining = balance == null ? null : required > balance ? required - balance : 0n;
  const needsFunds = direction === "BUY" && (remaining == null || remaining > 0n);
  const connect = () => run(async () => {
    setConnecting(true);
    try { setSender(await auth.connectFundingWallet(t("Choose the wallet that holds your Base USDC.", "Escolha a carteira onde você tem USDC na Base."))); }
    catch { setError(t("Wallet connection cancelled. Try again or use a manual transfer.", "Conexão cancelada. Tente de novo ou envie manualmente.")); }
    finally { setConnecting(false); }
  });
  const send = () => run(async () => {
    try {
      await funding.send({ owner, wallet: sender, shortfall: remaining, required, isCurrent: () => alive.current && currentOwner.current === owner });
    } catch (e) {
      const message = {
        4001: t("Transfer cancelled in your wallet. You can try again.", "Envio cancelado na carteira. Você pode tentar novamente."),
        WRONG_ACCOUNT: t("Select a different sending wallet on Base.", "Selecione outra carteira de origem na rede Base."),
        SENDER_BALANCE: t("This wallet doesn’t have enough USDC on Base.", "Esta carteira não tem USDC suficiente na rede Base."),
        FUNDING_BALANCE_CHANGED: t("Your balance is updating. Check the amount before sending.", "Seu saldo está sendo atualizado. Confira o valor antes de enviar."),
        TRANSFER_PENDING: t("A transfer is already being checked. Check your wallet activity.", "Já há um envio em verificação. Confira o histórico da sua carteira."),
      }[e?.code];
      setError(message || t("Check your wallet activity before retrying the transfer.", "Confira o histórico da sua carteira antes de tentar outro envio."));
    } finally { setTransfer(funding.pending(owner)); }
  });
  const out = q => q.direction === "BUY" ? `${(pt ? formatTokenAmount(q.tokenAmount) : formatTokensEn(q.tokenAmount))} ${token.symbol}` : money(q.usdcAmount, 6);
  return <Modal title={`${direction === "BUY" ? t("Buy", "Comprar") : t("Sell", "Vender")} ${token.symbol} · USDC`} lang={pt ? "pt-BR" : "en"} closeLabel={t("Close", "Fechar")} onClose={onClose} closeDisabled={busy} variant="checkout" suspended={connecting} stepKey={step}>
    <div className="flow-section checkout">
      {!api.enabled && !resume && !ramp ? <Notice title={t("USDC is coming soon", "USDC em breve")}>{t("Base USDC funding is being enabled. No payment or signature is requested.", "Estamos preparando o pagamento com USDC na Base. Nenhum pagamento ou assinatura será solicitado.")}</Notice> : <>
        {step === "amount" && <CheckoutRoute direction={direction} symbol={token.symbol} />}
        {notice && step === "review" && <Notice tone="info">{notice}</Notice>}
        {step === "otp" && <OtpStep locale={runtime.locale} email={email} setEmail={setEmail} otp={code} setOtp={setCode}
          sent={sent} busy={busy} error={error}
          onSend={() => run(async () => { await runtime.verification.requestOtp(email); setCode(""); setSent(true); })}
          onVerify={() => run(async () => { await runtime.verification.verifyOtp(email, code, { privyDid: auth.user?.privyDid }); setCode(""); setSent(false); setStep(returnStep); })}
          onChangeEmail={() => { setSent(false); setCode(""); setError(""); }} />}
        {step === "amount" && <>
          <label className="field-label" htmlFor="live-usdc-amount">{direction === "BUY" ? t("How much would you like to invest?", "Quanto você quer investir?") : t("How many tokens would you like to sell?", "Quantos tokens você quer vender?")}</label>
          <div className="amount-input checkout-input"><input id="live-usdc-amount" inputMode="decimal" autoComplete="off" value={amount} onChange={e => setAmount(e.target.value.replace(",", "."))} /><span>{direction === "BUY" ? "USDC" : token.symbol}</span></div>
          {direction === "BUY" && <div className="quick-values checkout-presets">{[25,100,250].map(n => <button key={n} aria-pressed={amount === String(n)} onClick={() => setAmount(String(n))}>{n} USDC</button>)}</div>}
          <button className="btn btn--primary btn--full btn--lg" disabled={busy} onClick={prepare}>{busy ? t("Getting quote…", "Buscando cotação…") : t("Get quote", "Ver cotação")}</button>
          {direction === "BUY" && <p className="checkout-hint">{t("Minimum 10 USDC. You’ll receive a Stock Token that tracks the share price.", "Mínimo de 10 USDC. Você recebe um token que acompanha o preço da ação.")}</p>}
        </>}
        {step === "review" && quote && <>
          <div className="fee-card">
            <dl className="checkout-quote-amounts">
              <div><dt>{direction === "BUY" ? t("You pay", "Você paga") : t("You sell", "Você vende")}</dt>
                <dd>{direction === "BUY" ? formatCostAmount(quote.usdcAmount, "USDC", runtime.locale) : `${(pt ? formatTokenAmount(quote.tokenAmount) : formatTokensEn(quote.tokenAmount))} ${token.symbol}`}
                  <small>{direction === "BUY" ? "Base" : t("Stock Token", "Token de ação")}</small></dd></div>
              <div><dt>{t("Estimated receipt", "Recebimento estimado")}</dt><dd>{out(quote)}
                <small>{direction === "BUY" ? t("Stock Token", "Token de ação") : "Base"}</small></dd></div>
            </dl>
            <LiveUsdcCosts quote={quote} locale={runtime.locale} />
          </div>
          <ReserveBalance amount={quote.gasReserve?.brl} currency="USDC" locale={runtime.locale} />
          {!needsFunds && <label className="check"><input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} /><span>{t("I reviewed the amount, costs and estimated receipt.", "Revisei o valor, os custos e o recebimento estimado.")}</span></label>}
          <button className="btn btn--primary btn--full btn--lg" disabled={busy || (!needsFunds && !accepted)} onClick={confirm}>
            {busy ? t("Checking balance…", "Conferindo saldo…") : needsFunds ? t("Add USDC", "Adicionar USDC") : t("Confirm and authorize", "Confirmar e autorizar")}
          </button>
          <p className="checkout-hint">{needsFunds
            ? t("Add USDC first, then review a fresh quote to buy.", "Adicione USDC e depois revise uma nova cotação para comprar.")
            : t("Your fatia. wallet asks you to authorize this exact amount. Vortex covers execution gas.", "Sua carteira fatia. pede autorização para este valor exato. A Vortex cobre a taxa de execução.")}</p>
          <div className="checkout-actions"><button className="back-button" disabled={busy} onClick={prepare}>{t("Refresh quote", "Atualizar cotação")}</button><button className="back-button" disabled={busy} onClick={() => { setQuote(null); setAccepted(false); setNotice(""); setStep("amount"); }}>{t("Change amount", "Alterar valor")}</button></div>
        </>}
        {step === "funding" && quote && <UsdcFunding owner={owner} balance={balance} remaining={remaining} balanceUnavailable={balanceUnavailable} sender={sender} transfer={transfer}
          canConnect={Boolean(funding?.supported && auth.connectFundingWallet)} busy={busy} locale={runtime.locale} t={t}
          onConnect={connect} onSend={send} onReview={prepare} onClose={onClose}
          onEdit={() => { runtime.fundingIntents.clear(owner); setQuote(null); setAccepted(false); setStep("amount"); }}
          onAcknowledge={() => run(async () => { await funding.acknowledgeUnsent(owner); setTransfer(funding.pending(owner)); })} />}
        {step === "resume" && <><h3>{t("Continue this order", "Continuar esta operação")}</h3><p>{t("An unfinished order is saved on this device. We check its state before requesting any authorization.", "Esta operação está salva neste aparelho. Conferimos o status antes de solicitar uma autorização.")}</p><button className="btn btn--primary btn--full" disabled={busy} onClick={retry}>{busy ? t("Preparing…", "Preparando…") : t("Resume order", "Retomar operação")}</button></>}
        {step === "processing" && <div className="result" role="status"><span className="spinner" aria-hidden="true" /><h3>{direction === "BUY" ? t("Buying your stock tokens", "Comprando seus tokens de ações") : t("Selling your stock tokens", "Vendendo seus tokens de ações")}</h3><p>{t("Track this order from your activity.", "Acompanhe esta operação no seu histórico.")}</p></div>}
        {step === "success" && <div className="result"><div className="result__seal">✓</div><h3>{direction === "BUY" ? t("Your Stock Tokens have arrived", "Seus tokens chegaram") : t("Your USDC is on Base", "Seu USDC está na Base")}</h3><p className="result__amount">{direction === "SELL" ? money(ramp?.usdcAmount, 6) : `${(pt ? formatTokenAmount(ramp?.tokenAmount ?? "0") : formatTokensEn(ramp?.tokenAmount))} ${token.symbol}`}</p><button className="btn btn--primary btn--full" onClick={onClose}>{t("Done", "Concluir")}</button></div>}
        {step === "issue" && <Notice tone="warning" title={t("This order needs attention", "Esta operação precisa de atenção")}>{t("Do not register another order to recover these funds. Keep the reference below for support.", "Não crie outra operação para recuperar estes fundos. Guarde o código abaixo para o suporte.")}</Notice>}
      </>}
      {error && step !== "otp" && <p className="field-error" role="alert">{error}</p>}
      {(ramp?.id || resume?.rampId) && <p className="op-ref">{t("Order reference", "Código da operação")}: <code>{ramp?.id || resume.rampId}</code></p>}
    </div>
  </Modal>;
}
