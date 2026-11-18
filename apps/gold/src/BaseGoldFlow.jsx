import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { formatUnits } from "viem";
import { BASE_USDC, GOLD_ASSETS } from "./lib/gold-config.js";
import { amountRaw } from "./lib/base-gold.js";
import { fundingDrafts } from "./lib/gold-funding.js";
import { gramsToPaxg } from "./lib/paxg.js";
import { getActiveRamp, clearActiveRamp } from "./lib/pilot-store.js";
import { classifyRamp, getBrazilBuyReadiness, hasVortexSession, requestVortexOtp, verifyVortexOtp } from "./lib/vortex.js";

const money = (value, currency) => currency === "USDC" ? `${Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 6 })} USDC` : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value));
const grams = value => Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 6 });

export function BaseGoldFlow({ ui: { Modal, OtpStep, KycStep, PixStep }, adapter, direction, paymentMethod = "pix", auth, resumeRamp, onClose, onComplete, demo = false }) {
  const crypto = paymentMethod === "usdc", buy = direction === "BUY", owner = auth.address;
  const currency = crypto ? "USDC" : "BRL";
  const [step, setStep] = useState(resumeRamp ? "resume" : "amount");
  const [drafts] = useState(() => fundingDrafts());
  const [amount, setAmount] = useState(() => buy ? (crypto ? drafts.get(owner)?.amount || "10" : "50") : "");
  const [exactSell, setExactSell] = useState(null), [pix, setPix] = useState("");
  const [quote, setQuote] = useState(null), [ramp, setRamp] = useState(null);
  const [balance, setBalance] = useState(null), [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [email, setEmail] = useState(auth.user?.email || ""), [otp, setOtp] = useState(""), [sent, setSent] = useState(false);
  const [pixReady, setPixReady] = useState(false);
  const locked = useRef(false), alive = useRef(true), finished = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  async function run(fn) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError("");
    try { await fn(); }
    catch (e) { if (alive.current) { setError(e.message || "Não foi possível continuar."); if (e.status === 401 || e.code === "AUTH_REQUIRED") { setSent(false); setStep("otp"); } } }
    finally { locked.current = false; if (alive.current) setBusy(false); }
  }
  function complete(current) {
    if (!alive.current || finished.current) return;
    finished.current = true;
    onComplete({ ...current, type: direction, network: "base", paymentMethod });
    clearActiveRamp(current.id); setRamp(current); setStep("success");
  }
  const requestAmount = () => buy ? amount.replace(",", ".") : exactSell || gramsToPaxg(amount);
  async function prepare() {
    if (demo) { setNotice("Demonstração: nenhuma operação ou verificação real será enviada."); return; }
    if (!adapter.isEnabled(paymentMethod)) throw new Error("Esta forma de pagamento estará disponível em breve.");
    if (!hasVortexSession(email)) { setStep("otp"); return; }
    const next = await adapter.quote({ direction, paymentMethod, amount: requestAmount(), owner });
    if (!alive.current) return;
    setQuote(next); setAccepted(false);
    if (crypto && buy) setBalance(await adapter.balance(owner));
    if (!crypto) {
      const ready = await getBrazilBuyReadiness();
      if (ready.kycStatus !== "approved") { setStep("kyc"); return; }
      if (!(buy ? ready.canBuy : ready.canSell)) throw new Error("Sua conta ainda não está liberada para esta operação Pix.");
    }
    setStep("review");
  }
  async function recover() {
    const saved = getActiveRamp(owner), id = ramp?.id || resumeRamp?.rampId || saved?.rampId;
    const current = await adapter.resume(id, owner, await auth.getEthereumProvider());
    if (!alive.current) return;
    setRamp(current);
    if (classifyRamp(current) === "success") { complete(current); return; }
    if (current.currentPhase !== "initial") { setStep("processing"); return; }
    if (buy && !crypto) { setQuote({ grams: Number(saved.outputAmount) * 31.1034768 }); setStep("pix"); return; }
    setRamp(await adapter.start(id, owner)); setStep("processing");
  }
  useEffect(() => { if (resumeRamp) run(recover); }, []);
  useEffect(() => {
    if (step !== "funding") return;
    let current = true, polling = false;
    const refresh = async () => { if (polling) return; polling = true; try { const value = await adapter.balance(owner); if (current) { setBalance(value); setError(""); } } catch { if (current) { setBalance(null); setError("Não foi possível consultar o saldo. Aguarde antes de enviar mais fundos."); } } finally { polling = false; } };
    refresh(); const timer = setInterval(refresh, 5000); return () => { current = false; clearInterval(timer); };
  }, [step, owner, adapter]);
  useEffect(() => {
    if (!["processing", "pix"].includes(step) || !ramp?.id) return;
    let current = true, polling = false;
    const refresh = async () => {
      if (polling) return; polling = true;
      try {
        if (step === "pix") { const canPay = await adapter.canPay(); if (current) setPixReady(canPay); }
        const next = await adapter.getRamp(ramp.id);
        if (!current) return;
        setRamp(next);
        if (classifyRamp(next) === "success") complete(next);
        else if (classifyRamp(next) === "failure") { setStep("issue"); setError("A operação precisa de atenção. Guarde o código para o suporte."); }
        else if (next.currentPhase !== "initial") setStep("processing");
      } catch (e) { if (current) { setPixReady(false); setError(e.message); } }
      finally { polling = false; }
    };
    const invalidate = () => setPixReady(false);
    document.addEventListener("visibilitychange", invalidate); window.addEventListener("pageshow", invalidate);
    refresh(); const timer = setInterval(refresh, 4000);
    return () => { current = false; clearInterval(timer); document.removeEventListener("visibilitychange", invalidate); window.removeEventListener("pageshow", invalidate); };
  }, [step, ramp?.id, adapter]);
  async function confirm() {
    if (!accepted || !quote) return;
    if (!hasVortexSession(email)) { setStep("otp"); return; }
    if (crypto && buy) {
      const confirmed = await adapter.balance(owner); setBalance(confirmed);
      if (confirmed < amountRaw(quote.inputAmount, 6)) { drafts.save(owner, quote.inputAmount); setStep("funding"); return; }
    }
    if (quote.expiresAt <= Date.now() + 15000) { await prepare(); setNotice("Cotação atualizada. Revise os valores e confirme novamente."); return; }
    try {
      const current = await adapter.register({ quote, owner, provider: await auth.getEthereumProvider(), pixDestination: pix, onRegistered: r => { drafts.clear(owner); if (alive.current) { setRamp(r); setStep("resume"); } } });
      if (!alive.current) return;
      setRamp(current);
      if (buy && !crypto) setStep("pix");
      else { setRamp(await adapter.start(current.id, owner)); setStep("processing"); }
    } catch (e) { if (getActiveRamp(owner)) setStep("resume"); throw e; }
  }
  const valid = buy ? Number(amount.replace(",", ".")) >= (crypto ? 10 : 50) : Number(amount.replace(",", ".")) > 0 && (crypto || pix.trim().length >= 5);
  const remaining = quote && balance != null ? amountRaw(quote.inputAmount, 6) - balance : null;
  return <Modal title={buy ? "Comprar ouro" : "Vender ouro"} onClose={onClose} closeDisabled={busy} wide>
    <div className="flow-step">
      {notice && <p className="info-card" role="status">{notice}</p>}
      {step === "amount" && <><h3>{buy ? "Quanto deseja comprar?" : "Quanto ouro deseja vender?"}</h3><label className="amount-field"><span>{buy ? `Valor em ${currency === "BRL" ? "reais" : "USDC"}` : "Quantidade em gramas"}</span><div><input aria-label={buy ? "Valor da compra" : "Gramas para vender"} inputMode="decimal" value={amount} onChange={e => { setExactSell(null); setAmount(e.target.value.replace(/[^\d,.]/g, "")); }} /><small>{buy ? (crypto ? "USDC" : "R$") : "g"}</small></div></label>{buy ? <div className="quick-values">{(crypto ? [10, 50, 100] : [50, 250, 500]).map(n => <button key={n} onClick={() => setAmount(String(n))}>{money(n, currency)}</button>)}</div> : <button className="inline-button" disabled={busy} onClick={() => run(async () => { const raw = await adapter.balance(owner, GOLD_ASSETS.base); setExactSell(formatUnits(raw, 18)); setAmount(String(Number(formatUnits(raw, 18)) * 31.1034768)); })}>Usar todo o ouro na Base</button>}{!buy && !crypto && <label className="field"><span>Sua chave Pix</span><input aria-label="Chave Pix" value={pix} onChange={e => setPix(e.target.value)} /></label>}<p className="legal-note">{crypto ? "USDC na Base. Revise os custos antes de autorizar a conversão." : "Pague ou receba pelo Pix. A verificação da Avenia ocorre no fluxo de pagamento."}</p><button className="button button--dark button--full" disabled={!valid || busy} onClick={() => run(prepare)}>Ver cotação</button></>}
      {step === "otp" && <OtpStep email={email} setEmail={setEmail} otp={otp} setOtp={setOtp} sent={sent} loading={busy} error="" demo={false} onSend={() => run(async () => { await requestVortexOtp(email); setSent(true); })} onVerify={() => run(async () => { await verifyVortexOtp(email, otp); if (ramp || resumeRamp || getActiveRamp(owner)) await recover(); else await prepare(); })} />}
      {step === "kyc" && <KycStep quote={quote.rawQuote} email={email} initialName={auth.user?.name} onApproved={() => run(prepare)} />}
      {step === "review" && quote && <><h3>{buy ? "Revise sua compra" : "Revise sua venda"}</h3><div className="quote-breakdown"><div><span>{buy ? "Você paga" : "Ouro a vender"}</span><b>{buy ? money(quote.inputAmount, currency) : `${grams(quote.grams)} g`}</b></div><div><span>Conversão e serviço</span><b>{money(Number(quote.processingFeeFiat) + Number(quote.partnerFeeFiat), currency)}</b></div><div><span>Rede</span><b>{money(quote.networkFeeFiat, currency)}</b></div><div className="quote-total"><span>Você recebe</span><b>{buy ? `${grams(quote.grams)} g` : money(quote.outputAmount, currency)}</b></div></div><p className="legal-note">Taxas acima já incluídas. {crypto || !buy ? "Você confirma uma autorização do valor exato. O custo da execução consta na cotação." : "O Pix será convertido em PAXG na Base."}</p>{!buy && !crypto && <p className="pix-recipient">Chave Pix: <strong>{pix}</strong></p>}<label className="confirm-check"><input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} /><span>Revisei os valores, as taxas e o destino.</span></label><button className="button button--dark button--full" disabled={!accepted || busy} onClick={() => run(confirm)}>{crypto && buy && balance != null && remaining > 0n ? "Continuar para enviar USDC" : "Confirmar operação"}</button><button className="back-button" disabled={busy} onClick={() => run(prepare)}>Atualizar cotação</button></>}
      {step === "funding" && <><h3>Envie USDC na Base para sua carteira</h3><p>Envie apenas USDC nativo na rede Base. Confirme a rede no aplicativo de origem.</p><div className="qr-frame"><QRCodeSVG value={owner} size={174} title="Sua carteira na Base" /></div><p className="wallet-address">{owner}</p><button className="button button--outline button--full" onClick={() => run(async () => { await navigator.clipboard.writeText(owner); setNotice("Endereço copiado."); })}>Copiar endereço</button><p>Saldo confirmado: {balance == null ? "—" : money(formatUnits(balance, 6), "USDC")}</p><p>Falta enviar: {remaining == null ? "—" : money(formatUnits(remaining > 0n ? remaining : 0n, 6), "USDC")}</p><p className="legal-note">Aguardamos duas confirmações. O depósito não inicia uma compra. Valores parciais, extras ou atrasados continuam na sua carteira. Você revisará uma nova cotação antes de autorizar.</p><small className="operation-reference">USDC · Base · {BASE_USDC.address}</small><button className="button button--dark button--full" disabled={busy || remaining == null || remaining > 0n} onClick={() => run(prepare)}>Revisar nova cotação</button></>}
      {step === "pix" && ramp && (pixReady ? <PixStep ramp={ramp} quote={quote} copied={false} onCopy={() => run(async () => { if (!await adapter.canPay()) throw new Error("Aguarde a disponibilidade do serviço."); await navigator.clipboard.writeText(ramp.depositQrCode); setNotice("Pix copiado."); })} onPaid={() => run(async () => { setRamp(await adapter.start(ramp.id, owner)); setStep("processing"); })} loading={busy} error="" /> : <p role="status">Conferindo a disponibilidade do Pix. Aguarde antes de pagar.</p>)}
      {step === "resume" && <><h3>Continuar esta operação</h3><p>Conferimos o pedido existente antes de solicitar uma nova confirmação.</p><button className="button button--dark button--full" disabled={busy} onClick={() => run(recover)}>Retomar operação</button></>}
      {step === "processing" && <><h3>Sua operação está em andamento</h3><p>Você pode fechar esta tela e acompanhar a mesma operação no painel.</p></>}
      {step === "success" && <><h3>{buy ? "Ouro recebido" : crypto ? "USDC recebido na Base" : "Venda concluída"}</h3><strong>{buy ? `${grams(Number(ramp.outputAmount) * 31.1034768)} g` : money(ramp.outputAmount, currency)}</strong><button className="button button--dark button--full" onClick={onClose}>Voltar ao painel</button></>}
      {step === "issue" && <h3>Guarde o código desta operação para o suporte</h3>}
      {error && <p className="field-error" role="alert">{error}</p>}
      {(ramp?.id || resumeRamp?.rampId) && <p className="operation-reference">Código da operação: <code>{ramp?.id || resumeRamp.rampId}</code></p>}
    </div>
  </Modal>;
}
