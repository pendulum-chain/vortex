import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Bank, CaretDown, Check, CheckCircle, Clock, Copy, EnvelopeSimple, Eye, EyeSlash, Fingerprint, Info, LockKey, SealCheck, ShieldCheck, SignOut, TrendUp, Wallet, WarningCircle, WhatsappLogo, X } from "@phosphor-icons/react";
import { SellFlow } from "./SellFlow.jsx";
import { MIN_BUY, QUICK_BUY_VALUES, DEFAULT_BUY, validBuyAmount, buyFeePercent } from "./lib/purchase-options.js";
import { QRCodeSVG } from "qrcode.react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { fetchPaxgMarket, getDemoMarket } from "./lib/market.js";
import { readPaxgBalance } from "./lib/paxg.js";
import { addRampHistory, clearActiveRamp, getActiveRamp, getRampHistory, saveActiveRamp } from "./lib/pilot-store.js";
import {
  classifyRamp,
  clearVortexSession,
  createBrazilSubaccount,
  createPaxgQuote,
  createVortexClient,
  getBrazilBuyReadiness,
  getPaxgAvailability,
  getBrazilKycUploads,
  pollBrazilKyc,
  pollRamp,
  registerPaxgBuy,
  requestVortexOtp,
  startRampSafely,
  submitBrazilKyc,
  uploadKycDocument,
  verifyVortexOtp,
} from "./lib/vortex.js";

const DEMO_EMAIL = "ana.silva@gmail.com";
const INITIAL_GRAMS = 12.634;
const HIGH_SLIPPAGE = 1.5;
const formatBRL = (value, digits = 2) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Number(value || 0));
const formatNumber = (value, digits = 3) => new Intl.NumberFormat("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Number(value || 0));
const shortAddress = (address) => address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "Preparando…";
const cleanCpf = (value) => String(value || "").replace(/\D/g, "").slice(0, 11);
const quoteSlippage = (quote, amount, pricePerGram) => Math.max(0, (1 - ((quote?.grams || 0) * pricePerGram) / Number(amount || 1)) * 100);

function Logo({ compact = false }) {
  return <span className={`wordmark ${compact ? "wordmark--compact" : ""}`}><img src={`${import.meta.env.BASE_URL}brand/ouro-wordmark.png`} alt="ouro." />{!compact && <small>by Vortex</small>}</span>;
}

const IconButton = ({ label, children, className = "", ...props }) => <button className={`icon-button ${className}`} type="button" aria-label={label} {...props}>{children}</button>;

function Modal({ title, description, onClose, children, wide = false, closeDisabled = false }) {
  const closeRef = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    closeRef.current?.focus();
    const onKey = (event) => event.key === "Escape" && !closeDisabled && onClose();
    document.addEventListener("keydown", onKey);
    document.body.classList.add("no-scroll");
    return () => { document.removeEventListener("keydown", onKey); document.body.classList.remove("no-scroll"); previous?.focus?.(); };
  }, [closeDisabled, onClose]);
  return <div className="modal-backdrop" role="presentation" onMouseDown={() => !closeDisabled && onClose()}><section className={`sheet ${wide ? "sheet--wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby="sheet-title" aria-describedby={description ? "sheet-description" : undefined} onMouseDown={(event) => event.stopPropagation()}>{!closeDisabled && <IconButton label="Fechar" className="sheet-close" onClick={onClose} ref={closeRef}><X size={21} /></IconButton>}<h2 id="sheet-title">{title}</h2>{description && <p id="sheet-description" className="sheet-description">{description}</p>}{children}</section></div>;
}

function Landing({ onStart, onLearn }) {
  return <main className="landing-shell"><header className="landing-topbar"><a href="#inicio" aria-label="ouro. início"><Logo /></a><button className="text-button" type="button" onClick={onStart}>Entrar</button></header><section className="landing-hero" id="inicio"><div className="landing-copy"><p className="eyebrow">COMPRE OURO COM PIX</p><h1>Comprar ouro<br />ficou simples<span className="gold-period">.</span></h1><p className="landing-lede">Escolha um valor. Pague com PIX.<br />{" "}Receba ouro com lastro físico, direto na sua carteira.</p><div className="landing-actions"><button className="button button--gold" type="button" onClick={onStart}>Comprar agora <ArrowRight size={19} weight="bold" /></button><button className="quiet-link" type="button" onClick={onLearn}>Por que é seguro?</button></div></div><div className="hero-product" aria-label="Barra de ouro físico"><img src={`${import.meta.env.BASE_URL}assets/gold-bar-cutout.png`} alt="Barra de ouro fino de um quilograma" /><div className="hero-balance-card"><strong>12,6 g</strong><div className="hairline" /><p>seu saldo em ouro</p></div></div></section><section className="trust-strip" aria-label="Informações essenciais"><span><Wallet size={31} /> <b>A partir de {formatBRL(MIN_BUY, 0)}</b></span><i aria-hidden="true" /><span><ShieldCheck size={34} /> <b>Ouro em custódia profissional</b></span><i aria-hidden="true" /><span><SealCheck size={34} /> <b>Emitido pela Paxos</b></span></section></main>;
}

function Login({ onClose, onLogin, loading }) {
  const [showOtherMethods, setShowOtherMethods] = useState(false);
  return <Modal title="Seu ouro começa aqui." description="Entre sem senha com seu número ou uma conta que você já usa. Uma carteira segura será criada automaticamente para você." onClose={onClose}><div className="login-trust"><span><Fingerprint size={21} /> Você confirma cada movimentação</span><span><LockKey size={21} /> Seu ouro fica na sua carteira</span></div><div className="login-methods"><button className="button button--whatsapp" type="button" onClick={() => onLogin("sms")} disabled={Boolean(loading)}><WhatsappLogo size={25} weight="fill" />{loading === "sms" ? "Entrando…" : "Continuar com WhatsApp"}</button><small className="login-method-note">Enviaremos um código de acesso pelo WhatsApp.</small><button className="button button--google" type="button" onClick={() => onLogin("google")} disabled={Boolean(loading)}><span className="google-mark" aria-hidden="true">G</span>{loading === "google" ? "Entrando…" : "Continuar com Google"}</button><button className="login-other-trigger" type="button" onClick={() => setShowOtherMethods((current) => !current)} aria-expanded={showOtherMethods}><span>Outras formas de entrar</span><CaretDown size={16} className={showOtherMethods ? "open" : ""} /></button>{showOtherMethods && <button className="button button--email" type="button" onClick={() => onLogin("email")} disabled={Boolean(loading)}><EnvelopeSimple size={22} />{loading === "email" ? "Entrando…" : "Continuar com e-mail"}</button>}</div><p className="legal-note">Ao continuar, você aceita os Termos de Uso e a Política de Privacidade.</p></Modal>;
}

function Welcome({ firstName, onContinue }) {
  return <Modal title={`Bem-vindo, ${firstName}.`} onClose={onContinue} wide><div className="welcome-grid"><div><p className="welcome-lede">Seu espaço para comprar e acompanhar ouro está pronto.</p><div className="welcome-points"><span><CheckCircle size={22} weight="fill" /><b>Conta criada</b><small>Sem senha e sem frase secreta.</small></span><span><Wallet size={22} weight="fill" /><b>Carteira protegida</b><small>As confirmações ficam nas suas mãos.</small></span><span><ShieldCheck size={22} weight="fill" /><b>Ouro lastreado</b><small>PAX Gold é lastreado em barras físicas.</small></span></div></div><div className="welcome-visual"><img src={`${import.meta.env.BASE_URL}assets/gold-bar-cutout.png`} alt="Barra de ouro" /><p><ShieldCheck size={18} weight="fill" /> Carteira criada com Privy</p></div></div><button className="button button--dark button--full" type="button" onClick={onContinue}>Ver meu painel <ArrowRight size={18} /></button></Modal>;
}

function AppHeader({ user, address, onLogout }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const initials = (user?.name || "Cliente Ouro").split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  return <header className="app-header"><a href="#painel" aria-label="ouro. painel"><Logo compact /></a><div className="app-header-right"><span className="secure-pill"><ShieldCheck size={17} weight="fill" /> Protegido</span><button className="avatar-button" type="button" onClick={() => setMenuOpen((value) => !value)} aria-expanded={menuOpen}><span>{initials}</span><CaretDown size={15} /></button>{menuOpen && <div className="account-menu"><b>{user?.name}</b><small>{user?.email}</small><span><Wallet size={16} /> {shortAddress(address)}</span><button type="button" onClick={onLogout}><SignOut size={17} /> Sair</button></div>}</div></header>;
}

function GoldTooltip({ active, payload }) {
  if (!active || !payload?.[0]) return null;
  const point = payload[0].payload;
  return <div className="chart-tooltip"><span>{point.label}</span><b>{formatBRL(point.value)} / g</b></div>;
}

function PriceChart({ market }) {
  const [period, setPeriod] = useState("30D");
  const periods = ["7D", "30D", "1A", "Tudo"];
  const shown = period === "7D" ? market.points.slice(-7) : period === "30D" ? market.points.slice(-30) : market.points;
  if (market.source === "unavailable") return <section className="panel chart-panel"><span className="section-kicker">PREÇO DO OURO</span><h2>Preço indisponível</h2><p>A cotação atual será apresentada antes de confirmar sua operação.</p><a href="https://www.coingecko.com/en/coins/pax-gold" target="_blank" rel="noreferrer">Comparar no CoinGecko</a></section>;
  return <section className="panel chart-panel" aria-labelledby="price-title"><div className="panel-heading"><div><span className="section-kicker">PREÇO DO OURO</span><h2 id="price-title">{formatBRL(market.brlPerGram)} <small>por grama</small></h2></div><span className={`market-change ${market.change >= 0 ? "positive" : "negative"}`}><TrendUp size={16} /> {market.change >= 0 ? "+" : ""}{market.change.toFixed(2)}%</span></div><div className="period-tabs" role="tablist" aria-label="Período do gráfico">{periods.map((item) => <button key={item} type="button" role="tab" aria-selected={period === item} className={period === item ? "active" : ""} onClick={() => setPeriod(item)}>{item}</button>)}</div><div className="chart-wrap" aria-label="Evolução do preço do PAXG em reais por grama"><ResponsiveContainer width="100%" height="100%"><AreaChart data={shown} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}><defs><linearGradient id="goldArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#c3a04c" stopOpacity={0.25} /><stop offset="100%" stopColor="#c3a04c" stopOpacity={0} /></linearGradient></defs><CartesianGrid vertical={false} stroke="#e8e1d5" strokeDasharray="2 5" /><XAxis dataKey="label" axisLine={false} tickLine={false} interval="preserveStartEnd" tick={{ fill: "#777169", fontSize: 11 }} /><Tooltip content={<GoldTooltip />} cursor={{ stroke: "#b69546", strokeDasharray: "3 3" }} /><Area type="monotone" dataKey="value" stroke="#a77f24" strokeWidth={2.2} fill="url(#goldArea)" activeDot={{ r: 4, fill: "#1f513f" }} /></AreaChart></ResponsiveContainer></div><div className="chart-footer"><span>1 PAXG = 1 onça troy de ouro fino</span><a href="https://www.coingecko.com/en/coins/pax-gold" target="_blank" rel="noreferrer">Comparar no CoinGecko <ArrowRight size={14} /></a></div></section>;
}

function Dashboard({ user, address, grams, balanceLoading, balanceError, market, onBuy, onSell, availability, onLogout, onLearn, history, demo, pending, onResume }) {
  const [balanceVisible, setBalanceVisible] = useState(true);
  const value = market.brlPerGram == null ? null : grams * market.brlPerGram;
  return <div className="app-shell" id="painel"><AppHeader user={user} address={address} onLogout={onLogout} />{demo && <div className="demo-banner"><span>Ambiente de teste</span> Nenhuma transação real será enviada.</div>}<main className="dashboard">{pending && <button className="resume-banner" type="button" onClick={onResume}><Clock size={20} /><span><b>Você tem uma operação em andamento</b><small>Toque para acompanhar sua operação.</small></span><ArrowRight size={18} /></button>}<section className="dashboard-intro"><div><p className="eyebrow">SEU OURO</p><p className="greeting">Olá, {user?.firstName || "Olá"}.</p></div><p>{balanceLoading ? "Atualizando…" : "Atualizado agora"}</p></section><section className="portfolio-grid"><article className="gold-balance panel"><div className="balance-head"><span>Saldo estimado</span><IconButton label={balanceVisible ? "Ocultar saldo" : "Mostrar saldo"} onClick={() => setBalanceVisible((value) => !value)}>{balanceVisible ? <Eye size={20} /> : <EyeSlash size={20} />}</IconButton></div><strong>{balanceLoading || value == null ? "—" : balanceVisible ? formatBRL(value) : "R$ •••••"}</strong><div className="gram-line"><span>{balanceVisible ? `${formatNumber(grams)} g de ouro` : "•••• g de ouro"}</span><small>PAXG · Ethereum</small></div>{balanceError && <p className="balance-warning"><WarningCircle size={15} /> Saldo indisponível agora. Tente novamente em instantes.</p>}<div className="balance-actions"><button className="button button--gold" type="button" onClick={onBuy} disabled={!address || !availability.buy}>Comprar ouro</button><button className="button button--outline" type="button" onClick={onSell} disabled={!address || balanceLoading || balanceError || grams <= 0 || !availability.sell}>Vender ouro</button></div><div className="ownership-note"><ShieldCheck size={18} weight="fill" /><span><b>Sob seu controle</b>O ouro fica na sua carteira, não conosco.</span></div></article><PriceChart market={market} /></section><section className="dashboard-lower"><article className="panel trust-card"><span className="section-kicker">POR TRÁS DO SEU OURO</span><h2>Ouro físico. Custódia profissional.</h2><p>Cada token PAXG representa ouro fino guardado em cofres profissionais e auditado pela Paxos.</p><button className="inline-button" type="button" onClick={onLearn}>Entenda como funciona <ArrowRight size={16} /></button></article><article className="panel activity-card"><div className="panel-heading"><div><span className="section-kicker">ATIVIDADE</span><h2>Movimentações</h2></div></div>{history.length === 0 ? <div className="empty-state"><Clock size={25} /><p>Nenhuma compra concluída ainda.</p><button type="button" onClick={onBuy}>Fazer primeira compra</button></div> : history.slice(0, 3).map((item) => <div className="activity-row" key={item.rampId}><span className="activity-icon"><Check size={16} /></span><span><b>{item.rampType === "SELL" ? "Venda de ouro" : "Compra de ouro"}</b><small>{new Date(item.completedAt).toLocaleDateString("pt-BR")}</small></span><span><b>{item.rampType === "SELL" ? "−" : "+"}{formatNumber(Number(item.rampType === "SELL" ? item.inputAmount : item.outputAmount) * 31.1034768)} g</b><small>{formatBRL(item.rampType === "SELL" ? item.outputAmount : item.inputAmount)}</small></span></div>)}</article></section><footer className="app-footer"><span>PAXG é emitido pela Paxos Trust Company.</span><div><button type="button" onClick={onLearn}>Segurança</button><a href="https://paxos.com/paxgold/" target="_blank" rel="noreferrer">Paxos</a><button type="button" onClick={onLearn}>Riscos</button></div></footer></main></div>;
}

function Progress({ current }) {
  const labels = ["Valor", "Segurança", "PIX"];
  return <div className="flow-progress" aria-label={`Etapa ${current + 1} de ${labels.length}`}>{labels.map((label, index) => <span key={label} className={index <= current ? "active" : ""}><i>{index < current ? <Check size={13} weight="bold" /> : index + 1}</i><small>{label}</small></span>)}</div>;
}

function QuoteBreakdown({ quote, amount }) {
  return <div className="quote-breakdown"><div><span>Valor da compra</span><b>{formatBRL(amount)}</b></div><div><span>Conversão e serviço</span><b>{formatBRL(quote.serviceFee)}</b></div><div><span>Rede Ethereum</span><b>{formatBRL(quote.networkFee)}</b></div><div className="quote-total"><span>Você recebe</span><b>{formatNumber(quote.grams)} g</b></div><small>Cotação temporária · todas as taxas já estão incluídas · sem margem adicional da ouro.</small></div>;
}

function AmountStep({ amount, setAmount, market, onNext }) {
  const valid = validBuyAmount(amount);
  return <div className="flow-step"><div className="flow-title"><span className="flow-icon"><Bank size={24} /></span><div><h3>Quanto deseja comprar?</h3><p>Você pagará este valor com PIX.</p></div></div><label className="amount-field"><span>Valor em reais</span><div><small>R$</small><input inputMode="numeric" autoFocus value={amount} onChange={(event) => setAmount(event.target.value.replace(/\D/g, ""))} aria-label="Valor da compra em reais" /></div></label><div className="quick-values">{QUICK_BUY_VALUES.map((value) => <button key={value} type="button" onClick={() => setAmount(String(value))}>{formatBRL(value, 0)}</button>)}</div><p className="conversion-hint">{valid && market.brlPerGram != null ? `Estimativa de mercado: ≈ ${formatNumber(Number(amount) / market.brlPerGram)} g antes das taxas` : `Compra mínima de ${formatBRL(MIN_BUY, 0)}`}</p>{valid && Number(amount) < 250 && <p className="legal-note">Comece com pouco para conhecer o serviço. As taxas pesam mais em compras pequenas. A venda também tem custos e exige ETH na carteira.</p>}<button className="button button--dark button--full" type="button" disabled={!valid} onClick={onNext}>Continuar <ArrowRight size={18} /></button></div>;
}

function OtpStep({ email, setEmail, otp, setOtp, sent, onSend, onVerify, loading, error, demo }) {
  return <div className="flow-step otp-step"><div className="flow-title"><span className="flow-icon"><ShieldCheck size={24} /></span><div><h3>Confirme que é você</h3><p>Como agora envolve dinheiro, a Vortex faz uma verificação adicional.</p></div></div>{!sent ? <><label className="vortex-email-field"><span>E-mail para a verificação</span><input type="email" inputMode="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@exemplo.com" /></label><div className="security-explainer"><LockKey size={22} /><span><b>Um código, só quando necessário</b>Enviaremos 6 números para <strong>{email || "o e-mail informado acima"}</strong>. Essa verificação pertence à Vortex e não altera sua forma de entrar na ouro.</span></div>{error && <p className="field-error">{error}</p>}<button className="button button--dark button--full" type="button" onClick={onSend} disabled={loading || !/^\S+@\S+\.\S+$/.test(email)}>{loading ? "Enviando…" : "Enviar código por e-mail"}</button></> : <><p className="sent-note"><CheckCircle size={18} weight="fill" /> Código enviado para {email}</p><input className="otp-single" inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={6} value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} aria-label="Código de 6 dígitos" placeholder="••••••" />{error && <p className="field-error">{error}</p>}{demo && <p className="demo-code">No ambiente de teste, use <b>123456</b>.</p>}<button className="button button--dark button--full" type="button" onClick={onVerify} disabled={otp.length !== 6 || loading}>{loading ? "Verificando e cotando…" : "Confirmar código"}</button><button className="link-button centered" type="button" onClick={onSend} disabled={loading}>Reenviar código</button></>}</div>;
}

function KycStep({ quote, email, initialName, onApproved }) {
  const [phase, setPhase] = useState("form");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [livenessUrl, setLivenessUrl] = useState("");
  const [prepared, setPrepared] = useState(null);
  const submittedKyc = useRef(false);
  const [form, setForm] = useState({ fullName: initialName || "", taxId: "", dateOfBirth: "", state: "", city: "", zipCode: "", streetAddress: "", documentType: "DRIVERS-LICENSE", front: null, back: null });
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const valid = form.fullName.trim().length > 4 && cleanCpf(form.taxId).length === 11 && form.dateOfBirth && form.state.length === 2 && form.city.trim() && form.zipCode.replace(/\D/g, "").length === 8 && form.streetAddress.trim().length > 5 && form.front && (form.documentType !== "ID" || form.back);

  const prepare = async () => {
    const livenessWindow = window.open("about:blank", "ouro-avenia");
    setLoading(true); setError("");
    try {
      const taxId = cleanCpf(form.taxId);
      const account = await createBrazilSubaccount({ name: form.fullName.trim(), taxId, quoteId: quote.id, sessionId: quote.sessionId });
      const uploads = await getBrazilKycUploads({ taxId, documentType: form.documentType, isDoubleSided: form.documentType === "ID" });
      await uploadKycDocument(uploads.idUpload.uploadURLFront, form.front);
      if (uploads.idUpload.uploadURLBack) {
        if (!form.back) throw new Error("Envie também o verso do documento.");
        await uploadKycDocument(uploads.idUpload.uploadURLBack, form.back);
      }
      const url = uploads.selfieUpload.livenessUrl;
      setLivenessUrl(url);
      setPrepared({ subAccountId: account.subAccountId, fullName: form.fullName.trim(), dateOfBirth: form.dateOfBirth, countryOfTaxId: "BR", taxIdNumber: taxId, email, country: "BR", state: form.state.toUpperCase(), city: form.city.trim(), zipCode: form.zipCode.replace(/\D/g, ""), streetAddress: form.streetAddress.trim(), uploadedSelfieId: uploads.selfieUpload.id, uploadedDocumentId: uploads.idUpload.id });
      setPhase("liveness");
      if (livenessWindow) livenessWindow.location.replace(url);
    } catch (nextError) {
      livenessWindow?.close();
      setError(nextError.message || "Não foi possível iniciar a verificação.");
    } finally { setLoading(false); }
  };

  const finish = async () => {
    setLoading(true); setError(""); setPhase("checking");
    try {
      if (!submittedKyc.current) { await submitBrazilKyc(prepared); submittedKyc.current = true; }
      const status = await pollBrazilKyc(prepared.taxIdNumber);
      if (String(status?.result || "").toUpperCase() !== "APPROVED") throw new Error(status?.failureReason ? `A verificação não foi aprovada (${status.failureReason}). Confira os dados e tente novamente.` : "A verificação ainda não foi aprovada. Aguarde alguns minutos e tente novamente.");
      onApproved();
    } catch (nextError) { setError(nextError.message || "Não foi possível concluir a verificação."); setPhase("liveness"); }
    finally { setLoading(false); }
  };

  if (phase !== "form") return <div className="flow-step"><div className="flow-title"><span className="flow-icon"><Fingerprint size={24} /></span><div><h3>{phase === "checking" ? "Validando seus dados" : "Faça a selfie segura"}</h3><p>{phase === "checking" ? "A Avenia está conferindo sua identidade." : "Conclua a verificação na janela da Avenia e volte aqui."}</p></div></div>{phase === "checking" ? <div className="processing-inline"><span /><b>Isso pode levar alguns minutos.</b><small>Não feche esta tela.</small></div> : <><div className="kyc-card"><span className="avenia-mark">A</span><div><b>Ambiente seguro da Avenia</b><p>A selfie confirma que o documento pertence a você. Suas imagens são enviadas para a verificação da Avenia.</p></div></div><a className="button button--outline button--full external-button" href={livenessUrl} target="ouro-avenia" rel="noreferrer">Abrir verificação da Avenia <ArrowRight size={18} /></a><button className="button button--dark button--full" type="button" onClick={finish} disabled={loading}>{loading ? "Conferindo…" : "Já concluí a selfie"}</button></>}{error && <p className="field-error flow-error">{error}</p>}</div>;

  return <div className="flow-step"><div className="flow-title"><span className="flow-icon"><Fingerprint size={24} /></span><div><h3>Uma verificação rápida</h3><p>Antes do primeiro PIX, a Avenia precisa confirmar sua identidade.</p></div></div><div className="kyc-card"><span className="avenia-mark">A</span><div><b>Feita pela Avenia</b><p>Tenha seu CPF e documento com foto em mãos. Seus dados não ficam armazenados neste aparelho.</p></div></div><div className="form-grid"><label className="field field--wide"><span>Nome completo</span><input value={form.fullName} onChange={(event) => update("fullName", event.target.value)} autoComplete="name" /></label><label className="field"><span>CPF</span><input value={form.taxId} onChange={(event) => update("taxId", cleanCpf(event.target.value))} inputMode="numeric" placeholder="11 dígitos" /></label><label className="field"><span>Data de nascimento</span><input type="date" value={form.dateOfBirth} onChange={(event) => update("dateOfBirth", event.target.value)} /></label><label className="field"><span>Estado (UF)</span><input value={form.state} onChange={(event) => update("state", event.target.value.replace(/[^a-z]/gi, "").slice(0, 2).toUpperCase())} maxLength={2} placeholder="SP" /></label><label className="field"><span>Cidade</span><input value={form.city} onChange={(event) => update("city", event.target.value)} autoComplete="address-level2" /></label><label className="field"><span>CEP</span><input value={form.zipCode} onChange={(event) => update("zipCode", event.target.value.replace(/\D/g, "").slice(0, 8))} inputMode="numeric" autoComplete="postal-code" /></label><label className="field field--wide"><span>Endereço completo</span><input value={form.streetAddress} onChange={(event) => update("streetAddress", event.target.value)} placeholder="Rua, número, bairro e complemento" autoComplete="street-address" /></label><label className="field field--wide"><span>Documento</span><select value={form.documentType} onChange={(event) => update("documentType", event.target.value)}><option value="DRIVERS-LICENSE">CNH</option><option value="ID">RG</option></select></label><label className="file-field"><span>{form.documentType === "ID" ? "Frente do documento" : "Foto do documento"}</span><input type="file" accept="image/jpeg,image/png,application/pdf" onChange={(event) => update("front", event.target.files?.[0] || null)} /><small>{form.front?.name || "JPG, PNG ou PDF"}</small></label>{form.documentType === "ID" && <label className="file-field"><span>Verso do documento</span><input type="file" accept="image/jpeg,image/png,application/pdf" onChange={(event) => update("back", event.target.files?.[0] || null)} /><small>{form.back?.name || "JPG, PNG ou PDF"}</small></label>}</div>{error && <p className="field-error flow-error">{error}</p>}<button className="button button--dark button--full" type="button" onClick={prepare} disabled={!valid || loading}>{loading ? "Enviando com segurança…" : "Continuar para a selfie"} <ArrowRight size={18} /></button><p className="legal-note">Ao continuar, estes dados são enviados diretamente à Avenia para verificação obrigatória.</p></div>;
}

function ConfirmStep({ amount, quote, market, onNext, loading, error }) {
  const [accepted, setAccepted] = useState(false);
  const feePercent = buyFeePercent(quote, amount);
  const slippage = market.source === "coingecko" || market.source === "demo" ? quoteSlippage(quote, amount, market.brlPerGram) : 0;
  return <div className="flow-step"><div className="flow-title"><span className="flow-icon"><CheckCircle size={24} /></span><div><h3>Revise sua compra</h3><p>Confira todos os valores antes de gerar o PIX.</p></div></div><QuoteBreakdown quote={quote} amount={Number(amount)} />{feePercent != null && <p className="legal-note">As taxas desta compra representam {feePercent.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% do valor pago. Vender depois tem novas taxas, incluindo ETH na carteira; você receberá menos de volta se o preço não compensar esses custos.</p>}{slippage > HIGH_SLIPPAGE && <div className="warning-card"><WarningCircle size={22} weight="fill" /><span><b>Diferença para o preço de referência ({slippage.toFixed(1)}%, incluindo taxas)</b>Compare os custos antes de confirmar ou tente novamente mais tarde. Um valor menor não reduz necessariamente as taxas.</span></div>}<label className="confirm-check"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} /><span>Entendo que o preço do ouro pode variar até a execução e que a operação em blockchain é definitiva.</span></label>{error && <p className="field-error flow-error">{error}</p>}<button className="button button--dark button--full" type="button" onClick={onNext} disabled={loading || !accepted}>{loading ? "Preparando seu PIX…" : "Gerar PIX"} <ArrowRight size={18} /></button></div>;
}

function PixStep({ ramp, quote, copied, onCopy, onPaid, loading, error }) {
  const [seconds, setSeconds] = useState(() => Math.max(0, Math.floor((new Date(ramp.expiresAt || Date.now() + 600_000).getTime() - Date.now()) / 1000)));
  useEffect(() => { const timer = setInterval(() => setSeconds((value) => Math.max(0, value - 1)), 1000); return () => clearInterval(timer); }, []);
  const pixCode = ramp.depositQrCode || "";
  const minutes = String(Math.floor(seconds / 60)).padStart(2, "0");
  const remaining = String(seconds % 60).padStart(2, "0");
  return <div className="flow-step pix-step"><div className="flow-title"><span className="flow-icon"><Bank size={24} /></span><div><h3>Pague com PIX</h3><p>Abra o app do seu banco e escaneie o código.</p></div></div><div className="pix-layout"><div className="qr-frame">{pixCode.startsWith("data:image") ? <img className="qr-image" src={pixCode} alt="QR Code PIX" /> : <QRCodeSVG value={pixCode} size={174} level="M" bgColor="#ffffff" fgColor="#17150f" />}</div><div className="pix-details"><span>Valor exato</span><strong>{formatBRL(ramp.inputAmount)}</strong><small><Clock size={15} /> {seconds ? `Expira em ${minutes}:${remaining}` : "PIX expirado"}</small></div></div><button className="copy-code" type="button" onClick={onCopy} disabled={!pixCode}><span><small>PIX copia e cola</small><b>{pixCode.slice(0, 28)}…</b></span>{copied ? <Check size={19} /> : <Copy size={19} />}</button><div className="info-card"><Info size={20} /><span><b>Conversão automática</b>Quando o PIX for identificado, ele será convertido em aproximadamente {formatNumber(quote.grams)} g de ouro e enviado à sua carteira.</span></div>{error && <p className="field-error flow-error">{error}</p>}<button className="button button--dark button--full" type="button" onClick={onPaid} disabled={loading || !seconds}>{loading ? "Confirmando com a Vortex…" : "Já fiz o PIX"}</button><p className="legal-note">Depois desta confirmação, a compra segue automaticamente. Você pode fechar e voltar sem perder o acompanhamento.</p></div>;
}

function ProcessingStep({ ramp, onClose }) {
  const phase = String(ramp?.currentPhase || "");
  const reachedGold = /swap|destination|transfer|complete/i.test(phase);
  return <div className="processing-step"><span className="processing-orb"><span /></span><h3>Seu ouro está a caminho</h3><p>Você pode fechar esta tela. A compra continuará e reaparecerá no painel.</p><div className="processing-list"><span className="current"><i>1</i>Verificando pagamento e conversão</span><span className={reachedGold ? "done" : "current"}><i>{reachedGold ? <Check size={14} /> : 2}</i>Comprando seu ouro</span><span className={phase.toLowerCase() === "complete" ? "done" : reachedGold ? "current" : ""}><i>{phase.toLowerCase() === "complete" ? <Check size={14} /> : 3}</i>Enviando para sua carteira</span></div><button className="link-button centered processing-close" type="button" onClick={onClose}>Acompanhar pelo painel</button></div>;
}

function SuccessStep({ ramp, onClose }) {
  const grams = Number(ramp.outputAmount || 0) * 31.1034768;
  return <div className="success-step"><span className="success-seal"><Check size={30} weight="bold" /></span><p className="eyebrow">CONCLUÍDO</p><h3>Ouro comprado.</h3><strong>{formatNumber(grams)} g</strong><p>Seu PAXG já aparece na carteira protegida por Privy.</p><div className="receipt-mini"><span>Compra<b>{formatBRL(ramp.inputAmount)}</b></span><span>Rede<b>Ethereum</b></span><span>Status<b className="positive">Confirmado</b></span></div>{ramp.transactionExplorerLink && <a className="external-link" href={ramp.transactionExplorerLink} target="_blank" rel="noreferrer">Ver transação no explorador <ArrowRight size={15} /></a>}<button className="button button--dark button--full" type="button" onClick={onClose}>Voltar ao painel</button></div>;
}

function FlowIssue({ message, onRetry, onClose }) {
  return <div className="flow-step issue-step"><span className="issue-icon"><WarningCircle size={31} /></span><h3>Não foi possível continuar</h3><p>{message}</p><button className="button button--dark button--full" type="button" onClick={onRetry}>Tentar novamente</button><button className="link-button centered" type="button" onClick={onClose}>Voltar ao painel</button></div>;
}

function TransactionFlow({ email, name, market, walletAddress, getEthereumProvider, onClose, onComplete, demo, resumeRamp }) {
  const [step, setStep] = useState(resumeRamp ? "resuming" : "amount");
  const [amount, setAmount] = useState(resumeRamp?.inputAmount || String(DEFAULT_BUY));
  const [otp, setOtp] = useState("");
  const [vortexEmail, setVortexEmail] = useState(email || "");
  const [otpSent, setOtpSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [quote, setQuote] = useState(resumeRamp ? { grams: Number(resumeRamp.outputAmount || 0) * 31.1034768 } : null);
  const [ramp, setRamp] = useState(null);
  const [copied, setCopied] = useState(false);
  const [kycRequired, setKycRequired] = useState(true);
  const clientRef = useRef(null);
  const completedRef = useRef(false);

  const prepareQuote = useCallback(async () => {
    if (!(await getPaxgAvailability()).buy) throw new Error("A compra de ouro está temporariamente indisponível.");
    const result = await createPaxgQuote(Number(amount), walletAddress);
    clientRef.current = result.client;
    setQuote(result.quote);
    const readiness = await getBrazilBuyReadiness(result.client);
    const required = String(readiness.kycStatus).toLowerCase() !== "approved";
    if (!required && !readiness.canBuy) throw new Error("Sua conta ainda não está liberada para comprar via PIX. Consulte a Vortex.");
    setKycRequired(required);
    setStep(required ? "kyc" : "confirm");
  }, [amount, walletAddress]);

  const loadExisting = useCallback(async () => {
    if (!resumeRamp?.rampId) return;
    setLoading(true); setError(""); setStep("resuming");
    try {
      const client = await createVortexClient();
      clientRef.current = client;
      const current = await client.getRampStatus(resumeRamp.rampId);
      setRamp(current);
      setQuote((value) => ({ ...(value || {}), grams: Number(current.outputAmount || resumeRamp.outputAmount || 0) * 31.1034768 }));
      const classification = classifyRamp(current);
      if (classification === "success") { if (!completedRef.current) { completedRef.current = true; clearActiveRamp(current.id); onComplete(current); } setStep("success"); }
      else if (classification === "failure") { clearActiveRamp(current.id); throw new Error("Esta compra expirou ou não pôde ser concluída. Nenhum novo PIX foi gerado."); }
      else if (current.currentPhase === "initial" && current.depositQrCode && resumeRamp.stage !== "registering") setStep("pix");
      else if (current.currentPhase === "initial") throw new Error("O registro precisa ser conferido pela Vortex. Consulte o suporte com o código da operação; não faça um novo PIX.");
      else setStep("processing");
    } catch (nextError) {
      if (nextError?.status === 401 || nextError?.code === "AUTH_REQUIRED") setStep("otp");
      else { setError(nextError.message || "Não foi possível recuperar esta compra."); setStep("issue"); }
    } finally { setLoading(false); }
  }, [resumeRamp]);

  useEffect(() => { if (resumeRamp) loadExisting(); }, [loadExisting, resumeRamp]);

  useEffect(() => {
    if (!ramp?.id || !clientRef.current || ["success", "issue"].includes(step)) return undefined;
    const controller = new AbortController();
    pollRamp(clientRef.current, ramp.id, { signal: controller.signal, onUpdate: (current) => {
      setRamp(current);
      const classification = classifyRamp(current);
      if (classification === "processing" && step === "pix") setStep("processing");
    } }).then((finalRamp) => {
      if (classifyRamp(finalRamp) === "success" && !completedRef.current) {
        completedRef.current = true;
        clearActiveRamp(finalRamp.id);
        onComplete(finalRamp);
        setStep("success");
      } else if (classifyRamp(finalRamp) === "failure") {
        clearActiveRamp(finalRamp.id);
        setError("A compra expirou ou não pôde ser concluída. Se houve débito, consulte o suporte com o código da operação.");
        setStep("issue");
      }
    }).catch((nextError) => {
      if (nextError.name !== "AbortError") { setError(nextError.message); setStep("issue"); }
    });
    return () => controller.abort();
  }, [ramp?.id, step]);

  const sendOtp = async () => { setLoading(true); setError(""); try { if (demo) await new Promise((resolve) => setTimeout(resolve, 350)); else await requestVortexOtp(vortexEmail); setOtpSent(true); } catch (nextError) { setError(nextError.message); } finally { setLoading(false); } };
  const verifyOtp = async () => {
    setLoading(true); setError("");
    try {
      if (demo) {
        await new Promise((resolve) => setTimeout(resolve, 400));
        if (otp !== "123456") throw new Error("Código incorreto. No teste, use 123456.");
        const gross = Number(amount) / (market.brlPerGram * 31.1034768);
        setQuote({ id: "demo-quote", outputAmount: String(gross * .985), grams: Number(amount) / market.brlPerGram * .985, serviceFee: Number(amount) * .01, networkFee: Number(amount) * .005, expiresAt: Date.now() + 60_000 });
        setKycRequired(false);
        setStep("confirm");
      } else {
        await verifyVortexOtp(vortexEmail, otp.replace(/\s/g, ""));
        if (resumeRamp) await loadExisting(); else await prepareQuote();
      }
    } catch (nextError) { setError(nextError.message || "Código inválido ou expirado."); }
    finally { setLoading(false); }
  };

  const generatePix = async () => {
    setLoading(true); setError("");
    try {
      if (demo) {
        const fake = { id: "demo-ramp", inputAmount: String(amount), outputAmount: String(quote.outputAmount), depositQrCode: "00020126360014BR.GOV.BCB.PIX0114SATOSHI-OURO5204000053039865406", expiresAt: new Date(Date.now() + 600_000).toISOString(), currentPhase: "initial", status: "pending" };
        setRamp(fake);
        setStep("pix");
        return;
      }
      let activeQuote = quote;
      let client = clientRef.current;
      if (!activeQuote?.expiresAt || activeQuote.expiresAt < Date.now() + 15_000) {
        const refreshed = await createPaxgQuote(Number(amount), walletAddress);
        activeQuote = refreshed.quote; client = refreshed.client; clientRef.current = client; setQuote(activeQuote);
        setError("A cotação foi atualizada. Confira os valores e confirme novamente.");
        return;
      }
      const provider = await getEthereumProvider();
      const registered = await registerPaxgBuy({ client, quote: activeQuote, walletAddress, ethereumProvider: provider });
      saveActiveRamp({ rampId: registered.id, walletAddress, inputAmount: registered.inputAmount, outputAmount: registered.outputAmount });
      setRamp(registered);
      if (!registered.depositQrCode) throw new Error("O código PIX ainda não está disponível. Consulte o suporte com o código desta operação; não faça uma nova compra.");
      setQuote((value) => ({ ...value, grams: Number(registered.outputAmount || activeQuote.outputAmount || 0) * 31.1034768 }));
      setStep("pix");
    } catch (nextError) { setError(nextError.message || "Não foi possível gerar o PIX."); const saved = getActiveRamp(walletAddress); if (saved) { setRamp({ id: saved.rampId }); setStep("issue"); } }
    finally { setLoading(false); }
  };

  const markPaid = async () => {
    setError("");
    if (demo) {
      setStep("processing");
      window.setTimeout(() => {
      const completed = { ...ramp, currentPhase: "complete", status: "completed" };
      setRamp(completed);
      onComplete(completed);
      setStep("success");
      }, 1_300);
      return;
    }
    setLoading(true);
    try {
      const started = await startRampSafely(clientRef.current, ramp.id);
      setRamp(started);
      setStep("processing");
    } catch (nextError) {
      setError(nextError.message || "Ainda não foi possível confirmar o PIX. Aguarde alguns segundos e tente novamente.");
    } finally { setLoading(false); }
  };
  const progress = step === "amount" ? 0 : ["otp", "kyc", "confirm", "resuming"].includes(step) ? 1 : 2;
  const closeDisabled = loading && ["confirm", "resuming"].includes(step);
  return <Modal title="Comprar ouro" onClose={onClose} wide closeDisabled={closeDisabled}>{!["processing", "success", "issue"].includes(step) && <Progress current={progress} />}{step === "amount" && <AmountStep amount={amount} setAmount={setAmount} market={market} onNext={() => setStep("otp")} />}{step === "otp" && <OtpStep email={vortexEmail} setEmail={setVortexEmail} otp={otp} setOtp={setOtp} sent={otpSent} onSend={sendOtp} onVerify={verifyOtp} loading={loading} error={error} demo={demo} />}{step === "kyc" && <KycStep quote={quote} email={vortexEmail} initialName={name} onApproved={() => setStep("confirm")} />}{step === "confirm" && <ConfirmStep key={quote?.id} amount={amount} quote={quote} market={market} onNext={generatePix} loading={loading} error={error} />}{step === "resuming" && <div className="processing-step"><span className="processing-orb"><span /></span><h3>Retomando sua compra</h3><p>Estamos buscando o status mais recente com a Vortex.</p></div>}{step === "pix" && ramp && <PixStep ramp={ramp} quote={quote} copied={copied} onCopy={async () => { await navigator.clipboard?.writeText(ramp.depositQrCode); setCopied(true); }} onPaid={markPaid} loading={loading} error={error} />}{step === "processing" && <ProcessingStep ramp={ramp} onClose={onClose} />}{step === "success" && ramp && <SuccessStep ramp={ramp} onClose={onClose} />}{step === "issue" && <FlowIssue message={error} onRetry={resumeRamp ? loadExisting : () => { if (getActiveRamp(walletAddress)) { setError("Consulte o suporte com o código desta operação antes de tentar novamente."); return; } setError(""); setStep("amount"); }} onClose={onClose} />}{ramp?.id && <p className="operation-reference">Código da operação: <code>{ramp.id}</code></p>}{["otp", "kyc", "confirm"].includes(step) && !loading && <button className="back-button" type="button" onClick={() => setStep(step === "otp" ? "amount" : step === "kyc" ? "otp" : kycRequired ? "kyc" : "otp")}><ArrowLeft size={16} /> Voltar</button>}</Modal>;
}

function LearnModal({ onClose }) {
  return <Modal title="Por que é seguro?" description="Informação clara para você decidir com tranquilidade." onClose={onClose} wide><div className="learn-grid"><article><ShieldCheck size={25} /><h3>Ouro físico lastreando cada token</h3><p>Cada PAXG representa uma onça troy fina de uma barra London Good Delivery guardada em cofres profissionais.</p></article><article><Bank size={25} /><h3>Emitido por uma empresa regulada</h3><p>A Paxos Trust Company emite o token e publica relatórios independentes sobre as reservas.</p></article><article><Wallet size={25} /><h3>Na sua própria carteira</h3><p>Seu saldo fica em uma carteira Ethereum criada pela Privy. A ouro. não guarda sua chave.</p></article><article><Fingerprint size={25} /><h3>Recuperação sem frase secreta</h3><p>Use o mesmo número do WhatsApp ou a mesma conta Google para recuperar o acesso. Nunca compartilhe códigos OTP ou aprovações com o suporte.</p></article><article><WarningCircle size={25} /><h3>Riscos que você deve conhecer</h3><p>O preço do ouro varia, transações em blockchain são definitivas e a liquidez depende dos provedores.</p></article></div><div className="source-links"><a href="https://paxos.com/paxgold/" target="_blank" rel="noreferrer">Documentação oficial da Paxos <ArrowRight size={15} /></a><a href="https://etherscan.io/token/0x45804880de22913dafe09f4980848ece6ecbaf78" target="_blank" rel="noreferrer">Contrato PAXG no Ethereum <ArrowRight size={15} /></a></div><button className="button button--dark button--full" type="button" onClick={onClose}>Entendi</button></Modal>;
}

export function App({ auth, demo = true }) {
  const [loginOpen, setLoginOpen] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [flowOpen, setFlowOpen] = useState(false);
  const [flowType, setFlowType] = useState("BUY");
  const [availability, setAvailability] = useState({ buy: demo, sell: demo });
  const [learnOpen, setLearnOpen] = useState(false);
  const [grams, setGrams] = useState(demo ? INITIAL_GRAMS : 0);
  const [balanceLoading, setBalanceLoading] = useState(!demo);
  const [balanceError, setBalanceError] = useState(false);
  const [history, setHistory] = useState([]);
  const [pending, setPending] = useState(null);
  const [market, setMarket] = useState(() => demo ? getDemoMarket() : { brlPerGram: null, points: [], change: 0, source: "unavailable" });
  const [authLoading, setAuthLoading] = useState("");
  const signedIn = auth?.authenticated || false;

  useEffect(() => { if (demo) return; let active = true; getPaxgAvailability().then((result) => active && setAvailability(result)).catch(() => {}); const timer = setInterval(() => getPaxgAvailability().then((result) => active && setAvailability(result)).catch(() => active && setAvailability({ buy: false, sell: false })), 60_000); return () => { active = false; clearInterval(timer); }; }, [demo]);
  useEffect(() => { let active = true; fetchPaxgMarket().then((next) => active && setMarket(next)).catch(() => {}); return () => { active = false; }; }, []);
  const loadBalance = useCallback(async () => {
    if (demo || !auth.address) return;
    setBalanceLoading(true); setBalanceError(false);
    try { const provider = await auth.getEthereumProvider(); const balance = await readPaxgBalance(provider, auth.address); setGrams(balance.grams); }
    catch { setBalanceError(true); }
    finally { setBalanceLoading(false); }
  }, [auth.address, auth.getEthereumProvider, demo]);
  useEffect(() => { if (!signedIn || !auth.address) return; setPending(getActiveRamp(auth.address)); setHistory(getRampHistory(auth.address)); loadBalance(); }, [signedIn, auth.address, loadBalance]);
  useEffect(() => { if (!signedIn || demo) return undefined; const timer = setInterval(loadBalance, 30_000); return () => clearInterval(timer); }, [signedIn, demo, loadBalance]);

  const startLogin = async (method) => { setAuthLoading(method); try { await Promise.resolve(auth.login({ loginMethods: [method] })); setLoginOpen(false); setWelcomeOpen(true); } finally { setAuthLoading(""); } };
  const logout = async () => { clearVortexSession(); await auth.logout(); setHistory([]); setPending(null); setGrams(demo ? INITIAL_GRAMS : 0); };
  const completeTransaction = (ramp) => {
    const next = addRampHistory({ rampId: ramp.id, walletAddress: auth.address?.toLowerCase(), inputAmount: ramp.inputAmount, outputAmount: ramp.outputAmount, transactionExplorerLink: ramp.transactionExplorerLink, rampType: ramp.type || "BUY" });
    setHistory(next.filter((item) => item.walletAddress === auth.address?.toLowerCase()));
    setPending(null);
    if (demo) setGrams((value) => Math.max(0, value + (ramp.type === "SELL" ? -Number(ramp.inputAmount) : Number(ramp.outputAmount)) * 31.1034768));
    window.setTimeout(loadBalance, 2_000);
  };
  const closeFlow = () => { setFlowOpen(false); setPending(getActiveRamp(auth.address)); loadBalance(); };

  if (!signedIn) return <><Landing onStart={() => setLoginOpen(true)} onLearn={() => setLearnOpen(true)} />{loginOpen && <Login onClose={() => setLoginOpen(false)} onLogin={startLogin} loading={authLoading} />}{learnOpen && <LearnModal onClose={() => setLearnOpen(false)} />}</>;
  return <><Dashboard user={auth.user} address={auth.address} grams={grams} balanceLoading={balanceLoading} balanceError={balanceError} market={market} onBuy={() => { setFlowType(pending?.rampType || "BUY"); setFlowOpen(true); }} onSell={() => { setFlowType(pending?.rampType || "SELL"); setFlowOpen(true); }} availability={availability} onLogout={logout} onLearn={() => setLearnOpen(true)} history={history} demo={demo} pending={pending} onResume={() => { setFlowType(pending?.rampType || "BUY"); setFlowOpen(true); }} />{welcomeOpen && <Welcome firstName={auth.user?.firstName || "Olá"} onContinue={() => setWelcomeOpen(false)} />}{flowOpen && flowType === "SELL" && <SellFlow ui={{ Modal, OtpStep, KycStep }} email={auth.user?.email || (demo ? DEMO_EMAIL : "")} name={auth.user?.name} walletAddress={auth.address} getEthereumProvider={auth.getEthereumProvider} demo={demo} availableGrams={grams} resumeRamp={pending} onClose={closeFlow} onComplete={completeTransaction} />}{flowOpen && flowType !== "SELL" && <TransactionFlow email={auth.user?.email || (demo ? DEMO_EMAIL : "")} name={auth.user?.name} market={market} walletAddress={auth.address} getEthereumProvider={auth.getEthereumProvider || (async () => null)} onClose={closeFlow} onComplete={completeTransaction} demo={demo} resumeRamp={pending} />}{learnOpen && <LearnModal onClose={() => setLearnOpen(false)} />}</>;
}
