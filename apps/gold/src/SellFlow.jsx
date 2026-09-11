import { useEffect, useRef, useState } from "react";
import { Bank, CheckCircle, Copy, WarningCircle } from "@phosphor-icons/react";
import { formatUnits } from "viem";
import { gramsToPaxg, readPaxgBalance } from "./lib/paxg.js";
import { clearActiveRamp, getActiveRamp, saveActiveRamp } from "./lib/pilot-store.js";
import { classifyRamp, createPaxgSellQuote, createVortexClient, getBrazilBuyReadiness, getPaxgAvailability, pollRamp, registerPaxgSell, requestVortexOtp, startRampSafely, submitWalletTransactions, verifyVortexOtp } from "./lib/vortex.js";

const brl = (amount) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(amount));
const gramsLabel = (amount) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 6 }).format(Number(amount));

export function SellFlow({ ui: { Modal, OtpStep, KycStep }, email, name, walletAddress, getEthereumProvider, demo, availableGrams, resumeRamp, onClose, onComplete }) {
  const [step, setStep] = useState(resumeRamp ? "recover" : "amount");
  const [amount, setAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState(null);
  const [pix, setPix] = useState("");
  const [otpEmail, setOtpEmail] = useState(email || "");
  const [otp, setOtp] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [quote, setQuote] = useState(null);
  const [ramp, setRamp] = useState(null);
  const [accepted, setAccepted] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hasGas, setHasGas] = useState(null);
  const client = useRef(null);
  const actionLock = useRef(false);
  const completed = useRef(false);
  const initialResume = useRef(resumeRamp);
  const active = ramp || (initialResume.current ? { id: initialResume.current.rampId } : null);
  const valid = Number(amount.replace(",", ".")) > 0 && Number(amount.replace(",", ".")) <= availableGrams + 1e-8 && pix.trim().length >= 5;

  const run = async (operation) => {
    if (actionLock.current) return;
    actionLock.current = true; setBusy(true); setError("");
    try { await operation(); }
    catch (e) {
      setError(e.code === 4001 ? "Confirmação cancelada. Você pode continuar esta mesma operação." : e.message || "Não foi possível continuar.");
      if (e.status === 401 || e.code === "AUTH_REQUIRED") { setSent(false); setOtp(""); setStep("otp"); }
    } finally { actionLock.current = false; setBusy(false); }
  };

  const complete = (current) => {
    setRamp(current);
    if (!completed.current) { completed.current = true; clearActiveRamp(current.id); onComplete({ ...current, type: "SELL" }); }
    setStep("success");
  };

  const recover = async () => {
    client.current = await createVortexClient();
    const id = active?.id || initialResume.current?.rampId;
    const current = await client.current.getRampStatus(id);
    setRamp(current);
    if (classifyRamp(current) === "success") { complete(current); return; }
    if (classifyRamp(current) === "failure") { setStep("issue"); throw new Error("Esta venda não foi concluída. Consulte o suporte com o código abaixo antes de tentar outra operação."); }
    setStep(current.currentPhase === "initial" ? "sign" : "processing");
  };
  useEffect(() => { if (initialResume.current) run(recover); }, []);

  useEffect(() => {
    if (step !== "processing" || !ramp?.id || demo) return;
    const controller = new AbortController();
    pollRamp(client.current, ramp.id, { signal: controller.signal, onUpdate: setRamp }).then((current) => {
      if (classifyRamp(current) === "success") complete(current);
      else { setStep("issue"); setError("A venda não foi concluída. Consulte o suporte com o código da operação."); }
    }).catch((e) => { if (e.name !== "AbortError") { setStep("recover"); setError(e.message); } });
    return () => controller.abort();
  }, [step, ramp?.id]);

  const prepareQuote = async () => {
    setAccepted(false);
    if (demo) {
      setQuote({ id: "demo-sell", inputAmount: gramsToPaxg(amount), outputAmount: Number(amount.replace(",", ".")) * 710, grams: Number(amount.replace(",", ".")), serviceFee: 2, networkFee: 1, expiresAt: Date.now() + 60_000 });
      setHasGas(true); setStep("review"); return;
    }
    if (!(await getPaxgAvailability()).sell) throw new Error("A venda de ouro está temporariamente indisponível. Tente novamente mais tarde.");
    const provider = await getEthereumProvider();
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x1" }] });
    const balance = BigInt(await provider.request({ method: "eth_getBalance", params: [walletAddress, "latest"] }));
    setHasGas(balance > 0n);
    const result = await createPaxgSellQuote(maxAmount || gramsToPaxg(amount), walletAddress);
    client.current = result.client; setQuote(result.quote);
    const readiness = await getBrazilBuyReadiness(result.client);
    if (readiness.kycStatus !== "approved") setStep("kyc");
    else if (!readiness.canSell) throw new Error("Sua conta ainda não está liberada para receber PIX. Verifique sua situação com a Vortex.");
    else setStep("review");
  };

  const chooseAll = () => run(async () => {
    if (demo) { setAmount(String(Math.floor(availableGrams * 1e6) / 1e6)); return; }
    const balance = await readPaxgBalance(await getEthereumProvider(), walletAddress);
    setMaxAmount(formatUnits(balance.raw, 18)); setAmount(String(Math.floor(balance.grams * 1e6) / 1e6));
  });

  const execute = () => run(async () => {
    if (demo) { complete({ id: "demo-sell-" + Date.now(), inputAmount: quote.inputAmount, outputAmount: quote.outputAmount, type: "SELL", status: "completed" }); return; }
    if (quote.expiresAt <= Date.now() + 15_000) { await prepareQuote(); setError("Atualizamos a cotação. Confira os novos valores e confirme novamente."); return; }
    const provider = await getEthereumProvider();
    try {
      const registered = await registerPaxgSell({ client: client.current, quote, walletAddress, ethereumProvider: provider, pixDestination: pix, onRegistered: (current) => { setRamp(current); setStep("sign"); } });
      saveActiveRamp({ rampId: registered.id, walletAddress, inputAmount: registered.inputAmount, outputAmount: registered.outputAmount, rampType: "SELL", stage: "ready" });
      const started = await startRampSafely(client.current, registered.id);
      setRamp(started); setStep("processing");
    } catch (e) {
      const saved = getActiveRamp(walletAddress);
      if (saved) { setRamp((current) => current || { id: saved.rampId }); setStep("sign"); }
      throw e;
    }
  });

  const continueSigning = () => run(async () => {
    if (!client.current) client.current = await createVortexClient();
    const current = await client.current.getRampStatus(active.id);
    setRamp(current);
    if (classifyRamp(current) === "success") { complete(current); return; }
    if (classifyRamp(current) === "failure") { setStep("issue"); throw new Error("Esta operação não pode ser retomada. Consulte o suporte."); }
    if (current.currentPhase !== "initial") { setStep("processing"); return; }
    const saved = getActiveRamp(walletAddress);
    if (saved?.stage === "registering") throw new Error("O registro precisa ser conferido pela Vortex. Envie o código abaixo ao suporte; não faça uma nova venda.");
    const transactions = (current.unsignedTxs || []).filter((tx) => tx.signer?.toLowerCase() === walletAddress.toLowerCase());
    if (saved?.stage !== "ready" && !transactions.length) throw new Error("Não foi possível recuperar as confirmações. Consulte o suporte com o código abaixo.");
    if (saved?.stage !== "ready") await submitWalletTransactions(client.current, current.id, transactions, walletAddress, await getEthereumProvider());
    saveActiveRamp({ rampId: current.id, walletAddress, inputAmount: current.inputAmount, outputAmount: current.outputAmount, rampType: "SELL", stage: "ready" });
    setRamp(await startRampSafely(client.current, current.id)); setStep("processing");
  });

  return <Modal title="Vender ouro" onClose={onClose} wide closeDisabled={busy}>
    {step === "amount" && <div className="flow-step"><div className="flow-title"><Bank size={28} /><div><h3>Ouro de volta em reais</h3><p>Receba na sua conta pelo PIX.</p></div></div><label className="amount-field"><span>Quantidade em gramas</span><div><input aria-label="Gramas para vender" inputMode="decimal" value={amount} onChange={(e) => { setMaxAmount(null); setAmount(e.target.value.replace(/[^\d,.]/g, "")); }} /><small>g</small></div></label><p className="conversion-hint">Disponível: {gramsLabel(availableGrams)} g <button className="inline-button" type="button" onClick={chooseAll} disabled={busy}>Usar tudo</button></p><label className="vortex-email-field"><span>Sua chave PIX</span><input value={pix} aria-label="Chave PIX" onChange={(e) => setPix(e.target.value)} placeholder="CPF, e-mail, celular ou chave aleatória" /></label><p className="legal-note">Use uma chave PIX da sua própria conta. Você revisará o valor líquido antes de confirmar.</p><button className="button button--dark button--full" disabled={!valid || busy} onClick={() => setStep("otp")}>Continuar</button></div>}
    {step === "otp" && <OtpStep email={otpEmail} setEmail={setOtpEmail} otp={otp} setOtp={setOtp} sent={sent} loading={busy} error="" demo={demo} onSend={() => run(async () => { if (!demo) await requestVortexOtp(otpEmail); setSent(true); })} onVerify={() => run(async () => { if (demo) { if (otp !== "123456") throw new Error("Use 123456 no teste."); } else await verifyVortexOtp(otpEmail, otp); if (active) await recover(); else await prepareQuote(); })} />}
    {step === "kyc" && <KycStep quote={quote} email={otpEmail} initialName={name} onApproved={() => run(prepareQuote)} />}
    {step === "review" && quote && <div className="flow-step"><h3>Revise sua venda</h3><div className="quote-breakdown"><div><span>Ouro a vender</span><b>{gramsLabel(quote.grams)} g</b></div><div><span>Conversão e serviço</span><b>{brl(quote.serviceFee)}</b></div><div><span>Taxas na cotação</span><b>{brl(quote.networkFee)}</b></div><div className="quote-total"><span>Você recebe no PIX</span><b>{brl(quote.outputAmount)}</b></div><small>Taxas acima já descontadas do valor em reais.</small></div><p className="pix-recipient">Chave PIX: <strong>{pix}</strong></p><div className={hasGas === false ? "warning-card" : "info-card"}><WarningCircle size={22} /><span><b>Taxa da sua carteira Ethereum</b>As confirmações de rede são pagas em ETH e exibidas na carteira antes da aprovação. Essa taxa é adicional ao valor da cotação.{hasGas === false && " Sua carteira ainda não tem ETH. Adicione ETH na rede Ethereum ao endereço abaixo para continuar."}</span></div>{hasGas === false && <WalletAddress address={walletAddress} copied={copied} setCopied={setCopied} />}<label className="confirm-check"><input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} /><span>Conferi minha chave PIX, o valor a receber e as taxas de rede.</span></label><button className="button button--dark button--full" disabled={!accepted || busy || hasGas === false} onClick={execute}>{busy ? "Preparando a venda…" : "Confirmar venda"}</button><button className="link-button centered" disabled={busy} onClick={() => run(prepareQuote)}>Atualizar cotação e saldo de ETH</button></div>}
    {step === "sign" && <div className="flow-step"><h3>Confirme na sua carteira</h3><p>Podem ser necessárias duas confirmações: autorizar o uso do PAXG e enviar a transação. Aguarde a confirmação de rede entre elas.</p><WalletAddress address={walletAddress} copied={copied} setCopied={setCopied} /><button className="button button--dark button--full" onClick={continueSigning} disabled={busy}>{busy ? "Aguardando confirmação…" : "Continuar esta venda"}</button></div>}
    {step === "processing" && <div className="processing-step"><span className="processing-orb"><span /></span><h3>Seu PIX está a caminho</h3><p>Acompanhe a conversão do ouro e o envio dos reais. A conclusão só aparece após confirmação da Vortex.</p><button className="link-button" onClick={onClose}>Acompanhar pelo painel</button></div>}
    {step === "success" && <div className="success-step"><CheckCircle size={48} /><h3>Venda concluída</h3><strong>{brl(ramp.outputAmount)}</strong><p>PIX confirmado pela Vortex.</p><button className="button button--dark button--full" onClick={onClose}>Voltar ao painel</button></div>}
    {step === "recover" && <div className="flow-step"><h3>Retomar venda</h3><p>Vamos consultar a operação existente.</p><button className="button button--dark button--full" disabled={busy} onClick={() => run(recover)}>{busy ? "Consultando…" : "Atualizar status"}</button></div>}
    {step === "issue" && <h3>A venda precisa de atenção</h3>}
    {error && <p className="field-error flow-error" role="alert">{error}</p>}
    {active?.id && <p className="operation-reference">Código da operação: <code>{active.id}</code></p>}
    {["otp", "review"].includes(step) && !active && <button className="back-button" disabled={busy} onClick={() => { setStep("amount"); setAccepted(false); }}>Voltar</button>}
  </Modal>;
}

function WalletAddress({ address, copied, setCopied }) {
  return <button className="copy-code wallet-copy" onClick={async () => { await navigator.clipboard.writeText(address); setCopied(true); }}><span><small>Sua carteira · somente rede Ethereum</small><b>{address}</b></span><Copy size={20} /><small>{copied ? "Copiado" : "Copiar"}</small></button>;
}
