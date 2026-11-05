// S7 buy flow: Gold's TransactionFlow state machine over the ramp adapter.
//   amount -> (code) -> prepare: availability, quote, price guard, readiness -> (kyc) -> confirm
//   confirm -> re-quote if it expires within 15 s, else register -> pix -> start -> processing
//   processing -> success | issue;  resume: getRamp -> success | issue | pix | processing | code
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Info } from "../components/icons.js";
import { Modal } from "../components/Modal.jsx";
import { QuoteCosts } from "../components/QuoteCosts.jsx";
import { Notice } from "../components/ui.jsx";
import { DEMO_TOOLS } from "../lib/config.js";
import { formatBRL, formatNumber, formatPercent, priceBRL } from "../format.js";
import { gasReserveLinePt, sellLaterNotePt } from "../lib/gas-reserve.js";
import { MARKET_CLOSED_NOTE_PT, tokenizationClosedNotePt, tokenizationWindowOpen, usMarketStatus } from "../lib/market-hours.js";
import { checkQuotePrice } from "../lib/price-guard.js";
import { freshPauseReason } from "../lib/ramp-contract.js";
import { DEFAULT_BUY, MIN_BUY, QUICK_BUY_VALUES, buyFeePercent, quoteNeedsRefresh, showSmallBuyNote, stepAfterCode, validBuyAmount } from "../lib/purchase-options.js";
import { estimateTokensForBrl, formatSharesApproxPt, formatTokenAmount, multiplierWeiFor, sharesWei } from "../lib/token.js";
import { FlowIssue, FlowProgress, GuardCard, KycStep, OtpStep, ProcessingSteps, QuoteTimer, SuccessSeal, TokenSummary, Waiting, errorMessage, needsCode, unavailableMessage } from "./parts.jsx";
import { PixStep } from "./PixStep.jsx";

const PROGRESS = ["Valor", "Segurança", "Revisão", "Pix"];
const PROGRESS_INDEX = { amount: 0, otp: 1, kyc: 1, confirm: 2, pix: 3 };

function AmountStep({ token, price, amount, setAmount, onNext, busy, error, onPayUsdc }) {
  const valid = validBuyAmount(amount);
  const estimate = valid ? estimateTokensForBrl(amount, price?.brl) : null;
  const now = new Date();
  const market = usMarketStatus(now);
  const display = amount ? new Intl.NumberFormat("pt-BR").format(Number(amount)) : "";
  return (
    <div className="flow-section">
      <TokenSummary token={token} price={price} />
      {onPayUsdc && <div className="payment-methods" role="group" aria-label="Forma de pagamento"><div className="payment-choice" aria-current="true"><b>Pix · Brasil</b><span>Em reais, pelo seu banco</span></div><button type="button" className="payment-choice" onClick={onPayUsdc}><b>USDC · Base</b><span>Wallet ou exchange · English checkout</span></button></div>}
      <div>
        <label className="field-label" htmlFor="buy-amount">Quanto deseja investir?</label>
        <div className="amount-input">
          <span aria-hidden="true">R$</span>
          <input id="buy-amount" inputMode="numeric" autoComplete="off" value={display} onChange={(event) => setAmount(event.target.value.replace(/\D/g, "").slice(0, 7))} aria-describedby="buy-hint" />
        </div>
      </div>
      <div className="quick-values" role="group" aria-label="Valores rápidos">
        {QUICK_BUY_VALUES.map((value) => <button key={value} type="button" aria-pressed={Number(amount) === value} onClick={() => setAmount(String(value))}>{formatBRL(value, 0)}</button>)}
      </div>
      <p className="hint" id="buy-hint">
        {estimate ? <>≈ <span className="mono">{formatTokenAmount(estimate)}</span> token {token.symbol} antes das taxas</> : amount && Number(amount) < MIN_BUY ? `Compra mínima de ${formatBRL(MIN_BUY, 0)}.` : `Compra mínima de ${formatBRL(MIN_BUY, 0)}, só valores inteiros.`}
      </p>
      {showSmallBuyNote(amount) && <Notice tone="neutral">Comece com pouco para conhecer o serviço. As taxas pesam mais em compras pequenas.</Notice>}
      {!market.open && <Notice tone="warning">{MARKET_CLOSED_NOTE_PT}{!tokenizationWindowOpen(now) && ` ${tokenizationClosedNotePt(now)}`}</Notice>}
      {error && <p className="field-error" role="alert">{error}</p>}
      <button className="btn btn--primary btn--lg btn--full" type="button" disabled={!valid || busy} onClick={onNext}>{busy ? <><span className="spinner" aria-hidden="true" /> Cotando…</> : <>Continuar <ArrowRight size={18} weight="bold" aria-hidden="true" /></>}</button>
    </div>
  );
}

function ConfirmStep({ token, quote, guard, reference, multiplierWei, onConfirm, onRefresh, busy, error, notice }) {
  const [accepted, setAccepted] = useState(false);
  const [guardAccepted, setGuardAccepted] = useState(false);
  const fee = buyFeePercent(quote, quote.brlAmount);
  const shares = sharesWei(quote.tokenAmountWei, multiplierWeiFor(token, multiplierWei));
  const deviation = guard?.deviationPct;
  const blocked = guard?.status === "block";
  const canConfirm = accepted && !blocked && (guard?.status !== "warn" || guardAccepted) && !busy;
  const reserve = gasReserveLinePt(quote);
  return (
    <div className="flow-section">
      {notice && <Notice tone="info">{notice}</Notice>}
      <dl className="breakdown">
        <div><dt>Você paga</dt><dd>{formatBRL(quote.brlAmount)}</dd></div>
        <div><dt>Taxas informadas (já incluídas)</dt><dd>{formatBRL(quote.fees.total)}{fee != null && <small>{formatNumber(fee, 2)}% do valor</small>}</dd></div>
        <div className="is-sub"><dt>Conversão e serviço</dt><dd>{formatBRL(quote.fees.service)}</dd></div>
        <div className="is-sub"><dt>Taxas das redes</dt><dd>{formatBRL(quote.fees.network)}</dd></div>
        {reserve && <div className="is-sub"><dt>{reserve.label}<small>{reserve.note}</small></dt><dd>{formatBRL(reserve.brl)}</dd></div>}
        <div><dt>Preço por token nesta cotação</dt><dd>{priceBRL(quote.impliedBrlPerToken)}{reference && <small>referência {priceBRL(reference.brl)}{deviation != null ? ` (${formatPercent(deviation)})` : ""}</small>}</dd></div>
        <div className="is-total"><dt>Você recebe</dt><dd>≈ {formatTokenAmount(quote.tokenAmount)} {token.symbol} (token)<small>{formatSharesApproxPt(shares)}</small></dd></div>
      </dl>
      <QuoteCosts quote={quote} />
      <QuoteTimer expiresAt={quote.expiresAt} />
      <GuardCard guard={guard} direction="BUY" reference={reference} accepted={guardAccepted} onAccept={setGuardAccepted} />
      <p className="hint">{sellLaterNotePt(quote)}</p>
      {quote.simulated && <p className="demo-hint">Cotação simulada: taxas ilustrativas, nenhum dinheiro é movimentado.</p>}
      <label className="check"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} /><span>Entendo que é um Stock Token (não a ação), que o preço pode variar até a execução e que a operação em blockchain é definitiva.</span></label>
      {error && <p className="field-error" role="alert">{error}</p>}
      {!blocked && <button className="btn btn--primary btn--lg btn--full" type="button" onClick={onConfirm} disabled={!canConfirm}>{busy ? <><span className="spinner" aria-hidden="true" /> Preparando seu Pix…</> : <>Gerar Pix de {formatBRL(quote.brlAmount)} <ArrowRight size={18} weight="bold" aria-hidden="true" /></>}</button>}
      <button className="back-button" type="button" onClick={onRefresh} disabled={busy}>Atualizar cotação</button>
    </div>
  );
}

export default function BuyFlow({ token, auth, runtime, market, flags, resume = null, initialAmount, demoQuote = false, onClose, onSettled, onPayUsdc }) {
  const { adapter, verification } = runtime;
  const wallet = auth.address;
  const privyDid = auth.user?.privyDid;
  const [step, setStep] = useState(resume ? "resuming" : "amount");
  const [amount, setAmount] = useState(validBuyAmount(initialAmount) ? String(initialAmount) : String(DEFAULT_BUY));
  const [email, setEmail] = useState(auth.user?.email || "");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [quote, setQuote] = useState(null);
  const [guard, setGuard] = useState(null);
  const [reference, setReference] = useState(null);
  const [ramp, setRamp] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const lock = useRef(false);
  const settled = useRef(false);
  const price = market.state.status === "unavailable" ? null : market.state.prices[token.symbol];
  const multiplierWei = flags?.[token.symbol]?.multiplierWei ?? null;

  async function run(operation) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try { await operation(); }
    catch (nextError) {
      if (nextError?.name === "AbortError") return;
      if (needsCode(nextError) && verification.required) { setOtpSent(false); setOtp(""); setStep("otp"); setError(""); }
      else setError(errorMessage(nextError, "Não foi possível preparar a cotação."));
    } finally { lock.current = false; setBusy(false); }
  }

  async function quoteNow() {
    const next = await adapter.quoteBuy({ symbol: token.symbol, brlAmount: Number(amount), walletAddress: wallet });
    const ref = market.model.referencePrice(token.symbol);
    setQuote(next); setReference(ref);
    setGuard(checkQuotePrice({ quote: next, reference: ref, tier: token.guardTier }));
    return next;
  }

  async function prepare() {
    const current = runtime.withIssuerPauses(await adapter.getAvailability(), flags)[token.symbol];
    if (!current?.buy) throw new Error(unavailableMessage(current?.reason));
    // The issuer pause from a fresh chain read (fail closed), not from the last portfolio poll.
    const read = await runtime.readHoldings(wallet).catch(() => null);
    const pause = freshPauseReason(read ? runtime.tokenFlags(read)[token.symbol] : null);
    if (pause) throw new Error(unavailableMessage(pause));
    await quoteNow();
    const readiness = await runtime.getReadiness();
    if (readiness.kycStatus !== "approved") { setStep("kyc"); return; }
    if (!readiness.canBuy) throw new Error("Sua conta ainda não está liberada para comprar com Pix. Consulte a Vortex.");
    setNotice(""); setStep("confirm");
  }

  function finish(final) {
    setRamp(final);
    if (!settled.current) { settled.current = true; onSettled?.(final); }
    setStep("success");
  }

  // The resumed operation, or the one registered in this flow (after the e-mail code).
  async function loadExisting(rampId = resume?.rampId) {
    const stage = rampId === resume?.rampId ? resume.stage : null;
    setStep("resuming");
    const current = await adapter.getRamp(rampId, { walletAddress: wallet });
    setRamp(current);
    if (current.classification === "success") { finish(current); return; }
    if (current.classification === "failure") { setError("Esta compra expirou ou não pôde ser concluída. Nenhum novo Pix foi gerado."); setStep("issue"); return; }
    if (current.currentPhase === "initial" && (current.depositQrCode || current.simulatedPix) && stage !== "registering") { setStep("pix"); return; }
    if (current.currentPhase === "initial") { setError("O registro precisa ser conferido pela Vortex. Consulte o suporte com o código da operação; não faça um novo Pix."); setStep("issue"); return; }
    setStep("processing");
  }

  // Resume an operation from the banner (spec: resuming -> getRamp -> …).
  useEffect(() => {
    if (!resume) return;
    run(async () => {
      try { await loadExisting(); }
      catch (nextError) {
        if (needsCode(nextError) && verification.required) throw nextError;
        setError(errorMessage(nextError, "Não foi possível recuperar esta compra.")); setStep("issue");
      }
    });
  }, []);

  // Demo deep link "buy-quote": code and KYC count as done, straight to the quote.
  useEffect(() => {
    if (!DEMO_TOOLS || !demoQuote || resume || !verification.markVerified) return;
    verification.markVerified();
    run(prepare);
  }, []);

  // Track the ramp until it is final (4 s / 20 min in the kit; the simulated ramp is faster).
  useEffect(() => {
    if (step !== "processing" || !ramp?.id) return undefined;
    const controller = new AbortController();
    adapter.pollStatus(ramp.id, { signal: controller.signal, walletAddress: wallet, onUpdate: setRamp })
      .then((final) => {
        if (final.classification === "success") finish(final);
        else { setRamp(final); setError("A compra não pôde ser concluída. Se houve débito, consulte o suporte com o código da operação."); setStep("issue"); }
      })
      .catch((nextError) => { if (nextError?.name !== "AbortError") { setError(errorMessage(nextError)); setStep("issue"); } });
    return () => controller.abort();
  }, [step, ramp?.id]);

  const continueFromAmount = () => {
    if (verification.required && !verification.hasSession({ email, privyDid })) { setError(""); setStep("otp"); return; }
    run(prepare);
  };
  // A public preview supplies only an amount. Authentication, KYC, fresh quotes and consent
  // follow the same path as a purchase entered here; recovery always takes precedence.
  const previewStarted = useRef(false);
  useEffect(() => {
    if (previewStarted.current || resume || demoQuote || !validBuyAmount(initialAmount)) return;
    previewStarted.current = true;
    continueFromAmount();
  }, []);
  const sendOtp = () => run(async () => { await verification.requestOtp(email); setOtpSent(true); });
  const verifyOtp = () => run(async () => {
    await verification.verifyOtp(email, otp, { privyDid });
    if (stepAfterCode({ direction: "BUY", rampId: ramp?.id, resuming: Boolean(resume) }) === "existing") await loadExisting(ramp?.id ?? resume.rampId);
    else await prepare();
  });
  const generatePix = () => run(async () => {
    if (quoteNeedsRefresh(quote)) {
      await quoteNow();
      setNotice("A cotação foi atualizada. Confira os valores e confirme novamente.");
      return;
    }
    try {
      const registered = await adapter.registerBuy({ quote, walletAddress: wallet });
      setRamp(registered);
      if (!registered.depositQrCode && !registered.simulatedPix) {
        setError("O código Pix ainda não está disponível. Consulte o suporte com o código desta operação; não faça uma nova compra.");
        setStep("issue");
        return;
      }
      setStep("pix");
    } catch (nextError) {
      const saved = runtime.activeRampStore.get(wallet);
      if (saved) { setRamp((current) => current || { id: saved.rampId }); setError(errorMessage(nextError)); setStep("issue"); return; }
      throw nextError;
    }
  });
  const refreshQuote = () => run(async () => { await quoteNow(); setNotice("Cotação atualizada."); });
  const markPaid = () => run(async () => {
    const started = await adapter.startRamp(ramp.id);
    setRamp(started);
    setStep("processing");
  });
  const retry = () => {
    if (resume) { setError(""); run(loadExisting); return; }
    if (runtime.activeRampStore.get(wallet)) { setError("Consulte o suporte com o código desta operação antes de tentar novamente."); return; }
    setError(""); setRamp(null); setStep("amount");
  };

  const tokenLabel = quote ? `≈ ${formatTokenAmount(quote.tokenAmount)} ${token.symbol} (token)` : `tokens ${token.symbol}`;
  const progress = PROGRESS_INDEX[step];
  const closeDisabled = busy && ["confirm", "resuming"].includes(step);
  const title = step === "success" ? "Compra concluída" : `Comprar ${token.symbol}`;

  return (
    <Modal title={title} onClose={onClose} wide closeDisabled={closeDisabled} stepKey={step} headerExtra={progress != null ? <FlowProgress labels={PROGRESS} current={progress} /> : null}>
      {step === "amount" && <AmountStep token={token} price={price} amount={amount} setAmount={setAmount} onNext={continueFromAmount} busy={busy} error={error} onPayUsdc={onPayUsdc} />}
      {step === "otp" && <OtpStep email={email} setEmail={setEmail} otp={otp} setOtp={setOtp} sent={otpSent} onSend={sendOtp} onVerify={verifyOtp} busy={busy} error={error} demoCode={verification.demoCode} />}
      {step === "kyc" && <KycStep kyc={runtime.kyc} quote={quote} email={email} initialName={auth.user?.name} onApproved={() => { setNotice(""); setStep("confirm"); }} />}
      {step === "confirm" && quote && <ConfirmStep key={quote.id} token={token} quote={quote} guard={guard} reference={reference} multiplierWei={multiplierWei} onConfirm={generatePix} onRefresh={refreshQuote} busy={busy} error={error} notice={notice} />}
      {step === "resuming" && <Waiting title="Retomando sua compra" text="Buscando o status mais recente da operação." />}
      {step === "pix" && ramp && <PixStep ramp={ramp} tokenLabel={tokenLabel} onPaid={markPaid} busy={busy} error={error} adapter={adapter} />}
      {step === "processing" && (
        <div className="flow-section">
          <Waiting title={`Seus tokens ${token.symbol} estão a caminho`} text="Você pode fechar esta tela: a compra continua e aparece no Início e no Histórico." />
          <ProcessingSteps direction="BUY" phase={ramp?.currentPhase} />
          <button className="btn btn--secondary btn--lg btn--full" type="button" onClick={onClose}>Fechar</button>
        </div>
      )}
      {step === "success" && ramp && (
        <div className="result">
          <SuccessSeal />
          <h3>Pronto! Seus tokens {token.symbol} chegaram na sua carteira.</h3>
          {ramp.tokenAmount && <p className="result__amount">+{formatTokenAmount(ramp.tokenAmount)} {token.symbol}</p>}
          <div className="receipt-mini">
            <div>Você pagou<b>{formatBRL(ramp.brlAmount)}</b></div>
            <div>Rede<b>Robinhood Chain</b></div>
            <div>Status<b style={{ color: "var(--positive)" }}>{ramp.simulatedPix ? "Simulação" : "Concluído"}</b></div>
          </div>
          {ramp.explorerLink && <a className="link" href={ramp.explorerLink} target="_blank" rel="noreferrer">Ver transação no explorador</a>}
          <button className="btn btn--primary btn--lg btn--full" type="button" style={{ marginTop: 8 }} onClick={onClose}>Concluir</button>
        </div>
      )}
      {step === "issue" && <FlowIssue message={error} onRetry={retry} onClose={onClose} />}
      {ramp?.id && step !== "success" && <p className="op-ref">Código da operação: <code>{ramp.id}</code></p>}
      {["otp", "kyc", "confirm"].includes(step) && !busy && !ramp && <div className="flow-foot" style={{ marginTop: 8 }}><button className="back-button" type="button" onClick={() => { setError(""); setStep("amount"); }}><ArrowLeft size={16} aria-hidden="true" /> Voltar</button></div>}
      {step === "amount" && <p className="legal-note" style={{ marginTop: 16 }}><Info size={14} aria-hidden="true" style={{ display: "inline", verticalAlign: "-2px" }} /> Você recebe um Stock Token, não a ação. O custo total aparece antes do Pix.</p>}
    </Modal>
  );
}
