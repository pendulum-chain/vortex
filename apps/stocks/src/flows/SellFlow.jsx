// S8 sell flow: Gold's SellFlow over the ramp adapter.
//   amount (tokens + Pix key) -> (code) -> prepare: availability, wallet on Robinhood Chain, balance
//   and ETH, quote, price guard, readiness -> (kyc) -> review -> register + sign -> start -> processing
//   sign (resume): resumeSell -> start;  processing -> success | issue
import { useEffect, useRef, useState } from "react";
import { QuoteCosts } from "../components/QuoteCosts.jsx";
import { ArrowLeft, ArrowRight, Check, Copy, GasPump } from "../components/icons.js";
import { Modal } from "../components/Modal.jsx";
import { Notice } from "../components/ui.jsx";
import { formatBRL, formatNumber, formatPercent, priceBRL } from "../format.js";
import { useCopy } from "../hooks.js";
import { DEMO_TOOLS } from "../lib/config.js";
import { sellGasNoticePt, sellGasRequiredWei } from "../lib/gas-reserve.js";
import { MARKET_CLOSED_SELL_NOTE_PT, tokenizationClosedNotePt, tokenizationWindowOpen, usMarketStatus } from "../lib/market-hours.js";
import { checkQuotePrice } from "../lib/price-guard.js";
import { freshPauseReason } from "../lib/ramp-contract.js";
import { quoteNeedsRefresh, stepAfterCode, validSellAmount } from "../lib/purchase-options.js";
import { formatTokenAmount, formatTokensPt, maxSellAmount, tokensToWei } from "../lib/token.js";
import { FlowIssue, FlowProgress, GuardCard, KycStep, OtpStep, ProcessingSteps, QuoteTimer, StepIntro, SuccessSeal, TokenSummary, Waiting, errorMessage, needsCode, unavailableMessage } from "./parts.jsx";

const PROGRESS = ["Quantidade", "Segurança", "Revisão", "Confirmação"];
const PROGRESS_INDEX = { amount: 0, otp: 1, kyc: 1, review: 2, sign: 3 };

const toInput = (decimal) => String(decimal).replace(".", ",");

function WalletAddress({ address }) {
  const [copied, copy] = useCopy();
  return (
    <button className="copy-code copy-code--wrap" type="button" onClick={() => copy(address, "wallet")}>
      <span><small>Sua carteira · somente rede Robinhood Chain</small><b>{address}</b></span>
      {copied === "wallet" ? <em><Check size={16} aria-hidden="true" /> Copiado</em> : <em><Copy size={16} aria-hidden="true" /> Copiar</em>}
    </button>
  );
}

function AmountStep({ token, price, raw, amount, setAmount, pixKey, setPixKey, onNext, busy, error }) {
  const valid = validSellAmount(amount, raw) && pixKey.trim().length >= 5;
  let estimate = null;
  try { estimate = price?.brl && tokensToWei(amount) > 0n ? Number(String(amount).replace(",", ".")) * price.brl : null; } catch { estimate = null; }
  const tooMuch = (() => { try { return tokensToWei(amount) > BigInt(raw); } catch { return false; } })();
  const now = new Date();
  return (
    <div className="flow-section">
      <TokenSummary token={token} price={price} />
      <div>
        <label className="field-label" htmlFor="sell-amount">Quantos tokens deseja vender?</label>
        <div className="amount-input amount-input--tokens">
          <input id="sell-amount" inputMode="decimal" autoComplete="off" placeholder="0,00" value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^\d,.]/g, ""))} aria-describedby="sell-hint" />
          <span className="amount-input__suffix mono" aria-hidden="true">{token.symbol}</span>
        </div>
      </div>
      <div className="balance-line" id="sell-hint">
        <span>Disponível: <span className="mono" style={{ color: "var(--ink)" }}>{formatTokensPt(raw)}</span></span>
        <button className="btn btn--ghost" type="button" onClick={() => setAmount(toInput(maxSellAmount(raw)))} disabled={BigInt(raw) <= 0n}>Usar tudo</button>
      </div>
      {estimate != null && !tooMuch && <p className="hint">≈ <span className="mono">{formatBRL(estimate)}</span> antes das taxas</p>}
      {tooMuch && <p className="field-error">Você tem {formatTokensPt(raw)}. Escolha uma quantidade menor.</p>}
      <label><span className="field-label">Sua chave Pix</span><input className="text-input" value={pixKey} onChange={(event) => setPixKey(event.target.value)} autoComplete="off" placeholder="CPF, e-mail, celular ou chave aleatória" /></label>
      <p className="hint">Use uma chave Pix da sua própria conta. Você revisa o valor líquido antes de confirmar.</p>
      {!usMarketStatus(now).open && <Notice tone="warning">{MARKET_CLOSED_SELL_NOTE_PT}{!tokenizationWindowOpen(now) && ` ${tokenizationClosedNotePt(now)}`}</Notice>}
      {error && <p className="field-error" role="alert">{error}</p>}
      <button className="btn btn--primary btn--lg btn--full" type="button" disabled={!valid || busy} onClick={onNext}>{busy ? <><span className="spinner" aria-hidden="true" /> Cotando…</> : <>Continuar <ArrowRight size={18} weight="bold" aria-hidden="true" /></>}</button>
    </div>
  );
}

function ReviewStep({ token, quote, guard, reference, pixKey, ethWei, requiredWei, address, onConfirm, onRefresh, busy, error, notice }) {
  const [accepted, setAccepted] = useState(false);
  const [guardAccepted, setGuardAccepted] = useState(false);
  // The purchase's gas reserve pays the fee; less ETH than this sell needs (a spent reserve, or a
  // higher fee) blocks before anything is registered, honestly.
  const gasNotice = sellGasNoticePt({ gasless: quote.gasless, ethWei, requiredWei });
  const noGas = gasNotice?.needsEth === true;
  const blocked = guard?.status === "block";
  const gross = quote.brlAmount + quote.fees.total;
  const canConfirm = accepted && !blocked && !noGas && (guard?.status !== "warn" || guardAccepted) && !busy;
  return (
    <div className="flow-section">
      {notice && <Notice tone="info">{notice}</Notice>}
      <dl className="breakdown">
        <div><dt>Você vende</dt><dd>{formatTokenAmount(quote.tokenAmount)} {token.symbol} (token)</dd></div>
        <div><dt>Valor bruto</dt><dd>{formatBRL(gross)}</dd></div>
        <div><dt>Taxas informadas (já descontadas)</dt><dd>{formatBRL(quote.fees.total)}<small>{formatNumber((quote.fees.total / gross) * 100, 2)}% do valor</small></dd></div>
        <div className="is-sub"><dt>Conversão e serviço</dt><dd>{formatBRL(quote.fees.service)}</dd></div>
        <div className="is-sub"><dt>Gas das redes</dt><dd>{formatBRL(quote.fees.network)}</dd></div>
        <div><dt>Preço por token nesta cotação</dt><dd>{priceBRL(quote.impliedBrlPerToken)}{reference && <small>referência {priceBRL(reference.brl)}{guard?.deviationPct != null ? ` (${formatPercent(guard.deviationPct)})` : ""}</small>}</dd></div>
        <div className="is-total"><dt>Você recebe no Pix</dt><dd>{formatBRL(quote.brlAmount)}</dd></div>
      </dl>
      <QuoteCosts quote={quote} />
      <QuoteTimer expiresAt={quote.expiresAt} />
      <p className="hint">Chave Pix: <b style={{ color: "var(--ink)" }}>{pixKey}</b></p>
      {gasNotice && <Notice tone={gasNotice.tone} title={gasNotice.title} role={noGas ? "alert" : undefined}>{gasNotice.text}</Notice>}
      {noGas && <WalletAddress address={address} />}
      <GuardCard guard={guard} direction="SELL" reference={reference} accepted={guardAccepted} onAccept={setGuardAccepted} />
      {quote.simulated && <p className="demo-hint">Cotação simulada: taxas ilustrativas, nenhum token sai da carteira.</p>}
      <label className="check"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} /><span>Conferi minha chave Pix, o valor a receber e as taxas. Sei que a operação em blockchain é definitiva.</span></label>
      {error && <p className="field-error" role="alert">{error}</p>}
      {!blocked && <button className="btn btn--primary btn--lg btn--full" type="button" onClick={onConfirm} disabled={!canConfirm}>{busy ? <><span className="spinner" aria-hidden="true" /> Preparando a venda…</> : "Confirmar venda"}</button>}
      <button className="back-button" type="button" onClick={onRefresh} disabled={busy}>{noGas ? "Atualizar saldo de ETH" : "Atualizar cotação"}</button>
    </div>
  );
}

export default function SellFlow({ token, auth, runtime, market, flags, holdingRaw = 0n, resume = null, demoReserveUsed = false, onClose, onSettled }) {
  const { adapter, verification } = runtime;
  const wallet = auth.address;
  const privyDid = auth.user?.privyDid;
  const [step, setStep] = useState(resume ? "resuming" : "amount");
  const [raw, setRaw] = useState(() => BigInt(holdingRaw || 0n));
  const [amount, setAmount] = useState(() => (demoReserveUsed ? toInput(maxSellAmount(holdingRaw || 0n)) : ""));
  const [pixKey, setPixKey] = useState(() => (demoReserveUsed ? auth.user?.email || "" : ""));
  const [email, setEmail] = useState(auth.user?.email || "");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [quote, setQuote] = useState(null);
  const [guard, setGuard] = useState(null);
  const [reference, setReference] = useState(null);
  const [ethWei, setEthWei] = useState(null);
  const [requiredWei, setRequiredWei] = useState(null);
  const [ramp, setRamp] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [notice, setNotice] = useState("");
  const lock = useRef(false);
  const settled = useRef(false);
  const price = market.state.status === "unavailable" ? null : market.state.prices[token.symbol];

  async function run(operation) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(""); setErrorCode("");
    try { await operation(); }
    catch (nextError) {
      if (nextError?.name === "AbortError") return;
      if (needsCode(nextError) && verification.required) { setOtpSent(false); setOtp(""); setStep("otp"); setError(""); }
      else { setError(errorMessage(nextError)); setErrorCode(nextError?.code || ""); }
    } finally { lock.current = false; setBusy(false); }
  }

  async function quoteNow() {
    const next = await adapter.quoteSell({ symbol: token.symbol, tokenAmount: amount, walletAddress: wallet });
    const ref = market.model.referencePrice(token.symbol);
    setQuote(next); setReference(ref);
    setGuard(checkQuotePrice({ quote: next, reference: ref, tier: token.guardTier }));
  }

  // Balance, ETH, the base fee and the issuer pause from fresh reads (a plain Robinhood Chain client,
  // never the wallet). An unknown base fee leaves the fresh check right before registering to decide.
  async function readBalances() {
    const [read, gasPriceWei] = await Promise.all([runtime.readHoldings(wallet), runtime.readGasPrice().catch(() => null)]);
    const position = read.positions.find((item) => item.symbol === token.symbol);
    setRaw(position?.raw ?? 0n);
    setEthWei(read.ethWei);
    setRequiredWei(sellGasRequiredWei(gasPriceWei));
    return { balance: position?.raw ?? 0n, pause: freshPauseReason(runtime.tokenFlags(read)[token.symbol]) };
  }

  async function prepare() {
    const current = runtime.withIssuerPauses(await adapter.getAvailability(), flags)[token.symbol];
    if (!current?.sell) throw new Error(unavailableMessage(current?.reason, "SELL"));
    await runtime.walletSeam(auth); // live: the embedded wallet switches to Robinhood Chain first
    const { balance, pause } = await readBalances();
    if (pause) throw new Error(unavailableMessage(pause, "SELL")); // fail closed, not the last poll's flags
    if (tokensToWei(amount) > balance) throw new Error(`Você tem ${formatTokensPt(balance)}. Escolha uma quantidade menor.`);
    await quoteNow();
    const readiness = await runtime.getReadiness();
    if (readiness.kycStatus !== "approved") { setStep("kyc"); return; }
    if (!readiness.canSell) throw new Error("Sua conta ainda não está liberada para receber Pix. Verifique sua situação com a Vortex.");
    setNotice(""); setStep("review");
  }

  function finish(final) {
    setRamp(final);
    if (!settled.current) { settled.current = true; onSettled?.(final); }
    setStep("success");
  }

  async function loadExisting() {
    setStep("resuming");
    const current = await adapter.getRamp(resume.rampId, { walletAddress: wallet });
    setRamp(current);
    if (current.classification === "success") { finish(current); return; }
    if (current.classification === "failure") { setError("Esta venda não foi concluída. Consulte o suporte com o código abaixo antes de tentar outra operação."); setStep("issue"); return; }
    if (resume.stage === "registering") { setError("O registro precisa ser conferido pela Vortex. Envie o código abaixo ao suporte; não faça uma nova venda."); setStep("issue"); return; }
    setStep(current.currentPhase === "initial" ? "sign" : "processing");
  }

  useEffect(() => {
    if (!resume) return;
    run(async () => {
      try { await loadExisting(); }
      catch (nextError) {
        if (needsCode(nextError) && verification.required) throw nextError;
        setError(errorMessage(nextError, "Não foi possível recuperar esta venda.")); setStep("issue");
      }
    });
  }, []);

  // Demo deep link "sell-reserve-used": code and KYC done, the demo reserve spent down to dust, the
  // whole holding with the demo e-mail as Pix key, straight to the review.
  useEffect(() => {
    if (!DEMO_TOOLS || !demoReserveUsed || resume || !verification.markVerified) return;
    verification.markVerified();
    runtime.spendDemoReserve();
    run(prepare);
  }, []);

  useEffect(() => {
    if (step !== "processing" || !ramp?.id) return undefined;
    const controller = new AbortController();
    adapter.pollStatus(ramp.id, { signal: controller.signal, walletAddress: wallet, onUpdate: setRamp })
      .then((final) => {
        if (final.classification === "success") finish(final);
        else { setRamp(final); setError("A venda não foi concluída. Consulte o suporte com o código da operação."); setStep("issue"); }
      })
      .catch((nextError) => { if (nextError?.name !== "AbortError") { setError(errorMessage(nextError)); setStep("issue"); } });
    return () => controller.abort();
  }, [step, ramp?.id]);

  const continueFromAmount = () => {
    if (verification.required && !verification.hasSession({ email, privyDid })) { setError(""); setStep("otp"); return; }
    run(prepare);
  };
  const sendOtp = () => run(async () => { await verification.requestOtp(email); setOtpSent(true); });
  const verifyOtp = () => run(async () => {
    await verification.verifyOtp(email, otp, { privyDid });
    const next = stepAfterCode({ direction: "SELL", rampId: ramp?.id, resuming: Boolean(resume) });
    if (next === "sign") setStep("sign");
    else if (next === "existing") await loadExisting();
    else await prepare();
  });
  const execute = () => run(async () => {
    if (quoteNeedsRefresh(quote)) {
      await quoteNow();
      setNotice("Atualizamos a cotação. Confira os novos valores e confirme novamente.");
      return;
    }
    const seam = await runtime.walletSeam(auth);
    try {
      const registered = await adapter.registerSell({ quote, walletAddress: wallet, pixKey, wallet: seam, onRegistered: (current) => { setRamp(current); setStep("sign"); } });
      setRamp(registered);
      const started = await adapter.startRamp(registered.id);
      setRamp(started);
      setStep("processing");
    } catch (nextError) {
      // Registered here: continue its confirmations. RAMP_IN_PROGRESS means the record is another
      // operation (e.g. from another tab): stay on the review with the message, never sign that one.
      const saved = nextError?.code === "RAMP_IN_PROGRESS" ? null : runtime.activeRampStore.get(wallet);
      if (saved) { setRamp((current) => current || { id: saved.rampId }); setStep("sign"); }
      else if (nextError?.code === "INSUFFICIENT_GAS" && nextError.details) {
        // Refused before registering (fresh read): the review's card now says why, with the address.
        setEthWei(nextError.details.balanceWei); setRequiredWei(nextError.details.requiredWei);
        return;
      }
      throw nextError;
    }
  });
  const continueSigning = () => run(async () => {
    const rampId = ramp?.id || resume?.rampId;
    const seam = await runtime.walletSeam(auth);
    // SELL_EXPIRED: the start window closed, so nothing is signed and the sell is settled; it cannot be continued.
    const current = await adapter.resumeSell({ rampId, walletAddress: wallet, wallet: seam }).catch((nextError) => { if (nextError?.code === "SELL_EXPIRED") setStep("issue"); throw nextError; });
    setRamp(current);
    if (current.classification === "success") { finish(current); return; }
    if (current.classification === "failure") { setError("Esta operação não pode ser retomada. Consulte o suporte."); setStep("issue"); return; }
    if (current.currentPhase !== "initial") { setStep("processing"); return; }
    setRamp(await adapter.startRamp(rampId));
    setStep("processing");
  });
  const refresh = () => run(async () => { await readBalances(); await quoteNow(); setNotice("Cotação e saldo atualizados."); });

  const progress = PROGRESS_INDEX[step];
  const title = step === "success" ? "Venda concluída" : `Vender ${token.symbol}`;
  const closeDisabled = busy && ["review", "sign", "resuming"].includes(step);

  return (
    <Modal title={title} onClose={onClose} wide closeDisabled={closeDisabled} stepKey={step} headerExtra={progress != null ? <FlowProgress labels={PROGRESS} current={progress} /> : null}>
      {step === "amount" && <AmountStep token={token} price={price} raw={raw} amount={amount} setAmount={setAmount} pixKey={pixKey} setPixKey={setPixKey} onNext={continueFromAmount} busy={busy} error={error} />}
      {step === "otp" && <OtpStep email={email} setEmail={setEmail} otp={otp} setOtp={setOtp} sent={otpSent} onSend={sendOtp} onVerify={verifyOtp} busy={busy} error={error} demoCode={verification.demoCode} />}
      {step === "kyc" && <KycStep kyc={runtime.kyc} quote={quote} email={email} initialName={auth.user?.name} onApproved={() => { setNotice(""); setStep("review"); }} />}
      {step === "review" && quote && <ReviewStep key={quote.id} token={token} quote={quote} guard={guard} reference={reference} pixKey={pixKey} ethWei={ethWei} requiredWei={requiredWei} address={wallet} onConfirm={execute} onRefresh={refresh} busy={busy} error={error} notice={notice} />}
      {step === "resuming" && <Waiting title="Retomando sua venda" text="Buscando o status mais recente da operação." />}
      {step === "sign" && (
        <div className="flow-section">
          <StepIntro icon={GasPump} title="Confirme na sua carteira">Até duas confirmações: autorizar e vender. A janela da carteira mostra a rede Robinhood Chain.</StepIntro>
          {runtime.simulated && <p className="demo-hint">Simulação: nenhuma confirmação real é pedida à carteira.</p>}
          {error && <p className="field-error" role="alert">{error}</p>}
          {errorCode === "INSUFFICIENT_GAS" && <WalletAddress address={wallet} />}
          <button className="btn btn--primary btn--lg btn--full" type="button" onClick={continueSigning} disabled={busy}>{busy ? <><span className="spinner" aria-hidden="true" /> Aguardando confirmação…</> : "Continuar esta venda"}</button>
        </div>
      )}
      {step === "processing" && (
        <div className="flow-section">
          <Waiting title="Seu Pix está a caminho" text="Você pode fechar esta tela: a venda continua e aparece no Início e no Histórico." />
          <ProcessingSteps direction="SELL" phase={ramp?.currentPhase} />
          <button className="btn btn--secondary btn--lg btn--full" type="button" onClick={onClose}>Fechar</button>
        </div>
      )}
      {step === "success" && ramp && (
        <div className="result">
          <SuccessSeal />
          <h3>Pronto! O Pix foi enviado para a sua chave.</h3>
          <p className="result__amount">{formatBRL(ramp.brlAmount)}</p>
          <div className="receipt-mini">
            <div>Você vendeu<b className="mono">{formatTokenAmount(ramp.tokenAmount)} {token.symbol}</b></div>
            <div>Destino<b>Pix</b></div>
            <div>Status<b style={{ color: "var(--positive)" }}>{runtime.simulated ? "Simulação" : "Concluído"}</b></div>
          </div>
          <button className="btn btn--primary btn--lg btn--full" type="button" style={{ marginTop: 8 }} onClick={onClose}>Concluir</button>
        </div>
      )}
      {step === "issue" && <FlowIssue message={error} onRetry={resume && errorCode !== "SELL_EXPIRED" ? () => { setError(""); run(loadExisting); } : null} onClose={onClose} />}
      {ramp?.id && step !== "success" && <p className="op-ref">Código da operação: <code>{ramp.id}</code></p>}
      {["otp", "kyc", "review"].includes(step) && !busy && !ramp && <div className="flow-foot" style={{ marginTop: 8 }}><button className="back-button" type="button" onClick={() => { setError(""); setStep("amount"); }}><ArrowLeft size={16} aria-hidden="true" /> Voltar</button></div>}
    </Modal>
  );
}
