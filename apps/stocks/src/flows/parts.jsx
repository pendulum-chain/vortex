// Steps shared by the buy and sell flows (lazy chunk). Ported from Gold's App.jsx and restyled:
// OtpStep, KycStep, ProcessingSteps, FlowIssue; plus the price-guard card and the quote summary.
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, CheckCircle, Fingerprint, ShieldCheck, WarningCircle } from "../components/icons.js";
import { buildAveniaKycPayload, cleanCpf, isValidCpf, kycOutcome } from "@vortexfi/consumer-kit";
import { Notice, TickerTile } from "../components/ui.jsx";
import { formatBRL, formatCepInput, formatCpfInput, priceBRL } from "../format.js";
import { STEP_LABELS_PT, stepFor, stepsFor } from "../lib/phases.js";
import { priceGuardCopyPt } from "../lib/price-guard.js";
import { UNAVAILABLE_COPY_PT, isComingSoon } from "../lib/ramp-contract.js";

/** Thin progress bar: "Etapa 2 de 4 · Segurança". */
export function FlowProgress({ labels, current }) {
  return (
    <div className="flow-progress" aria-label={`Etapa ${current + 1} de ${labels.length}: ${labels[current]}`} role="group">
      <div className="flow-progress__bars" aria-hidden="true">{labels.map((label, index) => <i key={label} className={index <= current ? "is-done" : ""} />)}</div>
      <small aria-hidden="true">Etapa {current + 1} de {labels.length} · {labels[current]}</small>
    </div>
  );
}

export function TokenSummary({ token, price, caption = "Preço por token" }) {
  return (
    <div className="flow-token">
      <TickerTile symbol={token.symbol} type={token.type} />
      <div><b>{token.namePt}</b><small>{token.symbol} · Stock Token</small></div>
      <div className="flow-token__price"><small>{caption}</small><span className="mono">{priceBRL(price?.brl)}</span></div>
    </div>
  );
}

/** Why buy/sell is not possible right now, in the user's words. */
export function unavailableMessage(reason, direction = "BUY") {
  if (isComingSoon(reason)) return direction === "SELL" ? "A venda com Pix será liberada em breve." : "A compra com Pix será liberada em breve.";
  if (reason === "paused") return "Negociação pausada pelo emissor. Tente novamente mais tarde.";
  return `${UNAVAILABLE_COPY_PT[reason] || "Indisponível no momento"}. Tente novamente mais tarde.`;
}

/** Wallet/SDK errors in plain Portuguese (Gold: 4001 = the user rejected the confirmation). */
export function errorMessage(error, fallback = "Não foi possível continuar.") {
  if (error?.code === 4001 || /user rejected|denied/i.test(String(error?.message || ""))) return "Confirmação cancelada. Você pode continuar esta mesma operação.";
  return error?.message || fallback;
}

export const needsCode = (error) => error?.status === 401 || error?.code === "AUTH_REQUIRED";

// The kit's poll gives up after 20 minutes or 5 network errors in a row, with an error that counts as
// transient, but the ramp goes on without it (long holds, lost signal). A flow starts it over after
// this long, for as long as its tracking screen is open.
export const POLL_RESTART_MS = 4_000;

export const KYC_IN_REVIEW_PT = "Sua verificação ainda está em análise. Tente novamente em alguns minutos.";

/** Price guard: warn needs a second checkbox, block has no confirm button. */
export function GuardCard({ guard, direction, reference, accepted, onAccept }) {
  const copy = guard ? priceGuardCopyPt(guard, { direction, reference }) : null;
  if (!copy) return null;
  if (copy.tone === "warning") {
    return (
      <>
        <Notice tone="warning" title={copy.title}>{copy.text}</Notice>
        <label className="check check--warning"><input type="checkbox" checked={accepted} onChange={(event) => onAccept(event.target.checked)} /><span>Entendi a diferença de preço e quero continuar com esta cotação.</span></label>
      </>
    );
  }
  return <Notice tone={copy.tone === "error" ? "error" : "neutral"} title={copy.title} role={copy.tone === "error" ? "alert" : undefined}>{copy.text}</Notice>;
}

/** Remaining validity of a quote, from the wall clock. */
export function QuoteTimer({ expiresAt }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1_000); return () => clearInterval(timer); }, []);
  const seconds = Math.max(0, Math.floor((Number(expiresAt) - now) / 1000));
  return (
    <p className="quote-timer" aria-live="off">
      <span>{seconds > 0 ? `Cotação válida por ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}` : "Cotação expirada: ela será atualizada ao confirmar."}</span>
      <span>Taxas já incluídas</span>
    </p>
  );
}

/** Icon + title + one sentence at the top of a step. */
export function StepIntro({ icon: Icon, title, children }) {
  return <ul className="points"><li><span><Icon size={22} aria-hidden="true" /></span><div><b>{title}</b><small>{children}</small></div></li></ul>;
}

export function OtpStep({ email, setEmail, otp, setOtp, sent, onSend, onVerify, busy, error, demoCode }) {
  return (
    <div className="flow-section">
      <StepIntro icon={ShieldCheck} title="Confirme seu e-mail">Para continuar com Pix, informe o código enviado pela Vortex ao seu e-mail.</StepIntro>
      {!sent ? (
        <>
          <label><span className="field-label">E-mail para o código</span><input className="text-input" type="email" inputMode="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@exemplo.com" /></label>
          {error && <p className="field-error" role="alert">{error}</p>}
          <button className="btn btn--primary btn--lg btn--full" type="button" onClick={onSend} disabled={busy || !/^\S+@\S+\.\S+$/.test(email)}>{busy ? <><span className="spinner" aria-hidden="true" /> Enviando…</> : "Enviar código por e-mail"}</button>
        </>
      ) : (
        <>
          <Notice tone="positive">Código enviado para <b style={{ display: "inline" }}>{email}</b>.</Notice>
          <label><span className="field-label">Código de 6 dígitos</span><input className="otp-input" inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={6} value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="••••••" /></label>
          {demoCode && <p className="demo-hint">Ambiente de teste: use o código <b className="mono">{demoCode}</b>.</p>}
          {error && <p className="field-error" role="alert">{error}</p>}
          <button className="btn btn--primary btn--lg btn--full" type="button" onClick={onVerify} disabled={otp.length !== 6 || busy}>{busy ? <><span className="spinner" aria-hidden="true" /> Verificando…</> : "Confirmar código"}</button>
          <button className="back-button" type="button" onClick={onSend} disabled={busy}>Reenviar código</button>
        </>
      )}
    </div>
  );
}

/** A file picker with Portuguese labels (the native control follows the browser's language). */
function FileField({ label, file, hint, onChange }) {
  return (
    <label className="file-field is-wide">
      <span>{label}</span>
      <span className="file-field__row"><span className="btn btn--secondary file-field__button" aria-hidden="true">Escolher arquivo</span><small>{file?.name || hint}</small></span>
      <input className="visually-hidden" type="file" accept="image/jpeg,image/png,application/pdf" onChange={(event) => onChange(event.target.files?.[0] || null)} />
    </label>
  );
}

const DEMO_FORM = Object.freeze({ fullName: "Ana Silva", taxId: "00000000000", dateOfBirth: "1990-01-01", state: "SP", city: "São Paulo", zipCode: "01310100", streetAddress: "Av. Paulista, 1000 (exemplo)", documentType: "DRIVERS-LICENSE" });

/** Avenia KYC, reached only when readiness says so; KYC belongs to the Vortex user. */
export function KycStep({ kyc, quote, email, initialName, onApproved }) {
  const demo = kyc.demo === true;
  const [phase, setPhase] = useState("form");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [livenessUrl, setLivenessUrl] = useState("");
  const [prepared, setPrepared] = useState(null);
  const submitted = useRef(false);
  // Closing the flow while "Validando seus dados" stops the status poll (kit poll honours the signal).
  const pollAbort = useRef(null);
  const alive = useRef(true);
  const errorRef = useRef(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; pollAbort.current?.abort(); }; }, []);
  useEffect(() => { if (error) errorRef.current?.scrollIntoView?.({ block: "nearest" }); }, [error, phase]);
  const checkAlive = () => { if (!alive.current) throw new DOMException("Aborted", "AbortError"); };
  const [form, setForm] = useState(() => (demo ? { ...DEMO_FORM, front: null, back: null } : { fullName: initialName || "", taxId: "", dateOfBirth: "", state: "", city: "", zipCode: "", streetAddress: "", documentType: "DRIVERS-LICENSE", front: null, back: null }));
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const filesOk = demo || (form.front && (form.documentType !== "ID" || form.back));
  const cpfInvalid = !demo && cleanCpf(form.taxId).length === 11 && !isValidCpf(form.taxId);
  const valid = form.fullName.trim().length > 4 && (demo || isValidCpf(form.taxId)) && form.dateOfBirth && form.state.length === 2 && form.city.trim() && form.zipCode.replace(/\D/g, "").length === 8 && form.streetAddress.trim().length > 5 && filesOk;

  const prepare = async () => {
    if (!valid || busy) return;
    // Opened synchronously on the click, so popup blockers allow it (Gold). Its opener is cut while
    // it is still our about:blank: the Avenia page (or anything it redirects to) must not be able
    // to navigate this tab, which holds the wallet and the Vortex session (reverse tabnabbing).
    const livenessWindow = demo ? null : window.open("about:blank", "fatia-avenia");
    if (livenessWindow) livenessWindow.opener = null;
    setBusy(true); setError("");
    try {
      const taxId = cleanCpf(form.taxId);
      const account = await kyc.createSubaccount({ name: form.fullName.trim(), taxId, quoteId: quote?.id, sessionId: quote?.rawQuote?.sessionId });
      checkAlive();
      const uploads = await kyc.getUploadUrls({ taxId, documentType: form.documentType, isDoubleSided: form.documentType === "ID" });
      checkAlive();
      if (uploads.idUpload.uploadURLFront) await kyc.uploadDocument(uploads.idUpload.uploadURLFront, form.front);
      checkAlive();
      if (uploads.idUpload.uploadURLBack) {
        if (!form.back) throw new Error("Envie também o verso do documento.");
        await kyc.uploadDocument(uploads.idUpload.uploadURLBack, form.back);
      }
      checkAlive();
      setPrepared(buildAveniaKycPayload({ form, uploads, subAccountId: account.subAccountId, email }));
      setLivenessUrl(uploads.selfieUpload.livenessUrl || "");
      setPhase("liveness");
      if (livenessWindow && uploads.selfieUpload.livenessUrl) livenessWindow.location.replace(uploads.selfieUpload.livenessUrl);
    } catch (nextError) {
      livenessWindow?.close();
      if (!alive.current) return;
      setError(nextError.message || "Não foi possível iniciar a verificação.");
    } finally { if (alive.current) setBusy(false); }
  };

  const finish = async () => {
    const controller = new AbortController();
    pollAbort.current = controller;
    setBusy(true); setError(""); setPhase("checking");
    try {
      if (!submitted.current) { await kyc.submit(prepared); checkAlive(); submitted.current = true; }
      const status = await kyc.poll(prepared.taxIdNumber, { signal: controller.signal });
      checkAlive();
      const outcome = kycOutcome(status);
      if (!outcome.approved) {
        submitted.current = false; setPrepared(null); setLivenessUrl(""); setPhase("form"); setError(outcome.message);
        return;
      }
      onApproved();
    } catch (nextError) {
      if (controller.signal.aborted) return; // the flow was closed
      setError(nextError.message || "Não foi possível concluir a verificação.");
      // "Já concluí a selfie" would only resubmit what was refused: these need a new upload and selfie.
      if (["KYC_NEW_ATTEMPT_BLOCKED", "KYC_SUBMISSION_REFUSED"].includes(nextError?.code)) { submitted.current = false; setPrepared(null); setLivenessUrl(""); setPhase("form"); }
      else setPhase("liveness");
    } finally { if (!controller.signal.aborted) setBusy(false); }
  };

  if (phase === "checking") {
    return <div className="result"><span className="result__seal result__seal--wait"><span className="spinner" style={{ width: 28, height: 28 }} aria-hidden="true" /></span><h3>Validando seus dados</h3><p>A Avenia está conferindo sua identidade. Isso pode levar alguns minutos; não feche esta tela.</p></div>;
  }
  if (phase === "liveness") {
    return (
      <div className="flow-section">
        <StepIntro icon={Fingerprint} title="Faça a selfie segura">A selfie confirma que o documento pertence a você. Conclua na janela da Avenia e volte aqui.</StepIntro>
        {demo ? <p className="demo-hint">Ambiente de teste: a selfie é simulada; nenhuma janela é aberta.</p>
          : <a className="btn btn--secondary btn--lg btn--full" href={livenessUrl} target="fatia-avenia" rel="noreferrer">Abrir verificação da Avenia <ArrowRight size={18} aria-hidden="true" /></a>}
        {error && <p className="field-error" role="alert">{error}</p>}
        <button className="btn btn--primary btn--lg btn--full" type="button" onClick={finish} disabled={busy}>{demo ? "Simular selfie concluída" : "Já concluí a selfie"}</button>
      </div>
    );
  }
  return (
    <div className="flow-section">
      <StepIntro icon={Fingerprint} title="Verifique sua identidade">Antes do primeiro Pix, a Avenia precisa confirmar sua identidade. Se você já concluiu essa verificação pelo ouro., ela também vale aqui.</StepIntro>
      {demo && <p className="demo-hint">Ambiente de teste: dados de exemplo já preenchidos; nada é enviado.</p>}
      <div className="form-grid">
        <label className="is-wide">Nome completo<input className="text-input" value={form.fullName} onChange={(event) => update("fullName", event.target.value)} autoComplete="name" /></label>
        <label>CPF<input className="text-input" value={formatCpfInput(form.taxId)} onChange={(event) => update("taxId", cleanCpf(event.target.value))} inputMode="numeric" maxLength={14} placeholder="000.000.000-00" aria-invalid={cpfInvalid} aria-describedby={cpfInvalid ? "kyc-cpf-error" : undefined} />{cpfInvalid && <small id="kyc-cpf-error" className="field-error">Confira o CPF: os dígitos não conferem.</small>}</label>
        <label>Data de nascimento<input className="text-input" type="date" value={form.dateOfBirth} onChange={(event) => update("dateOfBirth", event.target.value)} /></label>
        <label>Estado (UF)<input className="text-input" value={form.state} onChange={(event) => update("state", event.target.value.replace(/[^a-z]/gi, "").slice(0, 2).toUpperCase())} maxLength={2} placeholder="SP" /></label>
        <label>Cidade<input className="text-input" value={form.city} onChange={(event) => update("city", event.target.value)} autoComplete="address-level2" /></label>
        <label>CEP<input className="text-input" value={formatCepInput(form.zipCode)} onChange={(event) => update("zipCode", event.target.value.replace(/\D/g, "").slice(0, 8))} inputMode="numeric" maxLength={9} autoComplete="postal-code" placeholder="00000-000" /></label>
        <label>Documento<select className="text-input" value={form.documentType} onChange={(event) => update("documentType", event.target.value)}><option value="DRIVERS-LICENSE">CNH</option><option value="ID">RG</option></select></label>
        <label className="is-wide">Endereço completo<input className="text-input" value={form.streetAddress} onChange={(event) => update("streetAddress", event.target.value)} placeholder="Rua, número, bairro e complemento" autoComplete="street-address" /></label>
        <FileField label={form.documentType === "ID" ? "Frente do documento" : "Foto do documento"} file={form.front} hint={demo ? "Opcional no ambiente de teste" : "JPG, PNG ou PDF"} onChange={(file) => update("front", file)} />
        {form.documentType === "ID" && <FileField label="Verso do documento" file={form.back} hint={demo ? "Opcional no ambiente de teste" : "JPG, PNG ou PDF"} onChange={(file) => update("back", file)} />}
      </div>
      {error && <p ref={errorRef} className="field-error" role="alert">{error}</p>}
      <button className="btn btn--primary btn--lg btn--full" type="button" onClick={prepare} disabled={!valid || busy}>{busy ? <><span className="spinner" aria-hidden="true" /> Enviando com segurança…</> : <>Continuar para a selfie <ArrowRight size={18} aria-hidden="true" /></>}</button>
      <p className="legal-note">Estes dados passam pela Vortex e seguem para a Avenia, para a verificação obrigatória. Eles não ficam guardados neste aparelho.</p>
    </div>
  );
}

// While a step is running its done-label ("Pix recebido") would claim too much.
const IN_PROGRESS_PT = { payment: "Confirmando seu Pix" };

/** Progress from phases.js: steps only ever move forward. */
export function ProcessingSteps({ direction, phase, done = false }) {
  const [index, setIndex] = useState(() => stepFor(direction, phase, 0));
  useEffect(() => { setIndex((previous) => stepFor(direction, phase, previous)); }, [direction, phase]);
  const steps = stepsFor(direction).filter((step) => step !== "done");
  const current = done ? steps.length : index;
  const labels = STEP_LABELS_PT[direction];
  return (
    <ol className="timeline" aria-label="Andamento da operação">
      {steps.map((step, position) => (
        <li key={step} className={position < current ? "is-done" : position === current ? "is-current" : ""} aria-current={position === current ? "step" : undefined}>
          <i aria-hidden="true">{position < current ? <Check size={16} weight="bold" /> : null}</i>
          <span><b>{position === current && IN_PROGRESS_PT[step] ? IN_PROGRESS_PT[step] : labels[step]}</b>{position === current && <small>Em andamento…</small>}</span>
        </li>
      ))}
    </ol>
  );
}

export function FlowIssue({ message, onRetry, retryLabel = "Tentar novamente", onClose }) {
  return (
    <div className="result">
      <span className="result__seal result__seal--issue"><WarningCircle size={34} weight="fill" aria-hidden="true" /></span>
      <h3>Não foi possível continuar</h3>
      <p role="alert">{message || "Algo não saiu como esperado. Nenhuma nova movimentação foi feita."}</p>
      <div className="flow-foot" style={{ width: "100%", marginTop: 8 }}>
        {onRetry && <button className="btn btn--primary btn--lg btn--full" type="button" onClick={onRetry}>{retryLabel}</button>}
        <button className="btn btn--secondary btn--lg btn--full" type="button" onClick={onClose}>Fechar</button>
      </div>
    </div>
  );
}

export function Waiting({ title, text }) {
  return <div className="result"><span className="result__seal result__seal--wait"><span className="spinner" style={{ width: 28, height: 28 }} aria-hidden="true" /></span><h3>{title}</h3><p>{text}</p></div>;
}

export function SuccessSeal() {
  return <span className="result__seal"><CheckCircle size={40} weight="fill" aria-hidden="true" /></span>;
}

export const moneyOrDash = (value) => (Number.isFinite(Number(value)) && value !== "" && value != null ? formatBRL(value) : "—");
