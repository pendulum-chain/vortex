import { useEffect, useRef, useState } from "react";
import { Modal } from "../components/Modal.jsx";
import { UsdcQuoteCosts } from "../components/QuoteCosts.jsx";
import { Notice } from "../components/ui.jsx";
import { formatTokensEn, formatUsdc } from "../lib/international.js";
import { usdcText } from "../lib/usdc-checkout.js";
import { purchaseSelection } from "../lib/purchase-preview.js";

const tokens = (raw) => { const n = BigInt(raw); return `${n / 10n ** 18n}.${(n % 10n ** 18n).toString().padStart(18, "0")}`; };
const outputText = (q) => q.direction === "BUY" ? `${formatTokensEn(tokens(q.outputRaw))} ${q.symbol}` : formatUsdc(usdcText(q.outputRaw), 4);

export default function SimulatedUsdcFlow({ token, auth, runtime, market, direction = "BUY", resume = null, initialAmount, onClose, onSettled }) {
  const api = runtime.usdc;
  const wallet = auth.address;
  const prefill = direction === "BUY" && !resume ? purchaseSelection({ symbol: token.symbol, method: "usdc", amount: initialAmount, locale: "en" }) : null;
  const [amount, setAmount] = useState(prefill?.amount || (direction === "BUY" ? "100" : "0.1"));
  const [quote, setQuote] = useState(null);
  const [order, setOrder] = useState(null);
  const [accepted, setAccepted] = useState(false);
  const [method, setMethod] = useState("transfer");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [clock, setClock] = useState(Date.now());
  const [notice, setNotice] = useState("");
  const lock = useRef(false), settled = useRef(false), autoAttempt = useRef(null);
  const shown = order?.updatedQuote || order?.quote || quote;
  const status = order?.status || (quote ? "review" : "amount");
  const remaining = order && order.direction === "BUY" ? api.remaining(order) : 0n;
  const balance = api.enabled ? api.balanceRaw(wallet) : 0n;
  const canRefresh = !order && quote;
  useEffect(() => { setAccepted(false); }, [shown?.id]);

  async function run(fn) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try { await fn(); } catch (e) { setError(e.message || "Could not prepare this order."); }
    finally { lock.current = false; setBusy(false); }
  }
  useEffect(() => {
    if (!resume || !api.enabled) return;
    try { setOrder(api.get(resume.rampId, wallet)); } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!order?.id || !api.enabled) return;
    let alive = true;
    async function update() {
      if (lock.current) return;
      try {
        let next = api.get(order.id, wallet);
        if (next.status === "ready" && autoAttempt.current !== next.id) {
          autoAttempt.current = next.id;
          await market.model.getPrices();
          if (!alive) return;
          next = api.execute(next.id, wallet);
        }
        if (!alive) return;
        setOrder(next);
        if (next.status === "complete" && !settled.current) { settled.current = true; onSettled?.(); }
      } catch (e) { if (alive) setError(e.message); }
    }
    update();
    const timer = setInterval(update, 600);
    return () => { alive = false; clearInterval(timer); };
  }, [order?.id]);

  const prepare = () => run(async () => {
    await market.model.getPrices();
    const q = api.quote({ wallet, symbol: token.symbol, amount, direction });
    setQuote(q); setAccepted(false);
  });
  const previewStarted = useRef(false);
  useEffect(() => {
    if (previewStarted.current || !prefill || !api.enabled) return;
    previewStarted.current = true;
    prepare();
  }, []);
  const confirm = () => run(async () => {
    if (quote.expiresAt - Date.now() < 15_000) {
      await market.model.getPrices({ force: true });
      setQuote(api.quote({ wallet, symbol: token.symbol, amount, direction }));
      setAccepted(false); setNotice("The quote was refreshed. Review the updated amounts and confirm again."); return;
    }
    if (!accepted) return;
    setOrder(api.register(quote, wallet, balance >= BigInt(quote.grossRaw) ? "balance" : method));
  });
  const deposit = (partial = false) => run(async () => {
    const raw = partial ? remaining / 2n : remaining;
    if (raw <= 0n) return;
    setOrder(api.simulateDeposit(order.id, wallet, usdcText(raw)));
  });
  const acceptUpdated = () => run(async () => { setOrder(api.execute(order.id, wallet, true)); });
  const cancel = () => run(async () => { setOrder(api.cancel(order.id, wallet)); });
  const seconds = shown ? Math.max(0, Math.ceil((shown.expiresAt - clock) / 1000)) : 0;
  const paymentSeconds = order ? Math.max(0, Math.ceil((order.paymentDeadline - clock) / 1000)) : 0;
  const step = status === "amount" ? 0 : status === "review" || status === "needs_review" ? 1 : status === "awaiting_funds" ? 2 : 3;

  return <Modal title={`${direction === "SELL" ? "Sell" : "Buy"} ${token.symbol} ${direction === "SELL" ? "for" : "with"} USDC`} lang="en" closeLabel="Close" onClose={onClose} wide stepKey={status} closeDisabled={busy}>
    {!api.enabled ? <div className="flow-section"><Notice tone="info" title="USDC checkout is being prepared">Base USDC → Relay → Uniswap → your Stock Token. Live payment will become available when Vortex enables the execution route.</Notice><p>Your wallet will not be asked to pay or sign anything here.</p><button className="btn btn--secondary btn--full" onClick={onClose}>Back to stocks</button></div> : <div className="flow-section" lang="en">
      <ol className="usdc-steps" aria-label="Checkout progress">{["Amount", "Review", direction === "SELL" ? "Execution" : "Payment", direction === "SELL" ? "USDC" : "Tokens"].map((label, i) => <li key={label} className={i <= step ? "is-active" : ""} aria-current={i === step ? "step" : undefined}>{label}</li>)}</ol>
      <p className="demo-hint">Simulation · no real USDC is sent and no wallet signature is requested.</p>
      {notice && <Notice tone="info">{notice}</Notice>}
      {status === "amount" && <>
        <div className="payment-choice"><b>USDC on Base</b><span>Direct routing · Relay + Uniswap</span></div>
        <label className="field-label" htmlFor="usdc-amount">{direction === "BUY" ? "How much would you like to invest?" : "How many tokens would you like to sell?"}</label>
        <div className="amount-input"><input id="usdc-amount" inputMode="decimal" autoComplete="off" value={amount} onChange={(e) => setAmount(e.target.value)} /><span>{direction === "BUY" ? "USDC" : token.symbol}</span></div>
        {direction === "BUY" ? <><div className="quick-values">{[25, 100, 250, 1000].map((n) => <button key={n} onClick={() => setAmount(String(n))} aria-pressed={amount === String(n)}>{n} USDC</button>)}</div><p className="hint">Available: {formatUsdc(usdcText(balance), 4)} · minimum order 10 USDC.</p></> : <button className="back-button" onClick={() => setAmount(tokens(api.tokenBalance(wallet, token.symbol)))}>Use all {formatTokensEn(tokens(api.tokenBalance(wallet, token.symbol)))} tokens</button>}
        <button className="btn btn--primary btn--full btn--lg" disabled={busy} onClick={prepare}>{busy ? "Getting quote…" : "Get quote"}</button>
        <p className="hint">You receive a Stock Token that tracks the underlying security, not the share itself. Bank transfers are planned.</p>
      </>}
      {["review", "needs_review"].includes(status) && shown && <>
        {status === "needs_review" && <Notice tone="warning" title="Review a new quote">The price moved outside your approved limit. No stock purchase has been made. Your USDC remains available.</Notice>}
        <dl className="breakdown"><div><dt>{direction === "BUY" ? "You pay" : "You sell"}</dt><dd>{direction === "BUY" ? formatUsdc(shown.input) : `${formatTokensEn(shown.input)} ${token.symbol}`}</dd></div><div><dt>Included costs</dt><dd>{formatUsdc(usdcText(shown.totalFeesRaw), 4)}</dd></div><div className="is-total"><dt>You receive (estimate)</dt><dd>{outputText(shown)}</dd></div><div><dt>Network for USDC</dt><dd>Base</dd></div></dl>
        <UsdcQuoteCosts quote={shown} />
        <p className="hint">Price protection: minimum {outputText({ ...shown, outputRaw: (BigInt(shown.outputRaw) * 9950n / 10000n).toString() })}. Maximum included costs: {formatUsdc(usdcText(BigInt(shown.totalFeesRaw) + (BigInt(shown.grossRaw) * 5n + 9999n) / 10000n), 6)}.</p>
        <p className="hint">{seconds ? `Quote valid for ${seconds}s.` : "Quote expired. Refresh before continuing."} Funding may take longer. We recheck the price when funds arrive and buy automatically only within your approved limits.</p>
        {direction === "BUY" && status === "review" && balance < BigInt(shown.grossRaw) && <div className="payment-methods" role="group" aria-label="USDC payment method"><button className="payment-choice" aria-pressed={method === "wallet"} onClick={() => setMethod("wallet")}><b>Pay from a wallet</b><span>Use an external wallet with Base USDC</span></button><button className="payment-choice" aria-pressed={method === "transfer"} onClick={() => setMethod("transfer")}><b>Send USDC</b><span>Transfer from a wallet or exchange</span></button></div>}
        <label className="check"><input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} /><span>I approve this amount and the price protection above. Ask me again if output falls more than 0.5% or costs increase by more than 5 bps of the order value.</span></label>
        <button className="btn btn--primary btn--full btn--lg" onClick={status === "needs_review" ? acceptUpdated : confirm} disabled={busy || !accepted || (status === "needs_review" && !seconds)}>{status === "needs_review" ? "Confirm updated quote" : direction === "SELL" ? "Confirm sale to USDC" : balance >= BigInt(shown.grossRaw) ? "Buy with USDC balance" : "Continue to USDC payment"}</button>
        {canRefresh && <button className="back-button" onClick={prepare} disabled={busy}>Refresh quote</button>}
        {status === "review" && <button className="back-button" disabled={busy} onClick={() => { setQuote(null); setAccepted(false); }}>Change amount</button>}
        {status === "needs_review" && <button className="back-button" disabled={busy} onClick={() => run(async () => { await market.model.getPrices({ force: true }); setOrder(api.execute(order.id, wallet)); })}>Refresh quote</button>}
        {status === "needs_review" && <button className="back-button" onClick={cancel}>Cancel purchase · keep USDC</button>}
      </>}
      {status === "awaiting_funds" && <>
        <div className="qr qr--sim" role="img" aria-label="Simulation: no USDC payment address"><span><b>Simulation</b>No payment address or QR code.<br />Do not send funds.</span></div>
        <dl className="breakdown"><div><dt>Remaining payment</dt><dd>{formatUsdc(usdcText(remaining), 6)}</dd></div><div><dt>Token / network</dt><dd>USDC / Base</dd></div><div><dt>Payment window</dt><dd>{Math.floor(paymentSeconds / 60)}:{String(paymentSeconds % 60).padStart(2, "0")}</dd></div></dl>
        <p className="hint">{order.method === "wallet" ? "In the live flow, confirm the payment in your sending wallet." : "In the live flow, scan the payment QR or copy your receive address into your wallet or exchange."} Send only native USDC on Base. No manual ETH purchase should be needed for onward execution.</p>
        <Notice tone="info" title="Automatic purchase within your limits">We wait for confirmed funds, then refresh the quote. Late or insufficient deposits remain as USDC; they do not trigger an unchecked purchase.</Notice>
        <button className="btn btn--primary btn--full btn--lg" disabled={busy} onClick={() => deposit()}>{order.method === "wallet" ? "Simulate wallet payment" : "Simulate incoming USDC"}</button>
        <button className="back-button" disabled={busy} onClick={() => deposit(true)}>Simulate partial payment</button>
        <button className="back-button" onClick={cancel}>Cancel order · keep received USDC</button>
      </>}
      {["ready", "processing"].includes(status) && <div className="result"><span className="spinner" aria-hidden="true" /><h3>{status === "ready" ? "Checking your order" : "Your order is executing"}</h3><p>{status === "ready" ? "Checking a fresh quote against your approved limits." : direction === "SELL" ? "Uniswap sale → Relay bridge → Base USDC." : "Relay bridge → Uniswap execution → wallet settlement."}</p><p>You can close this window and return to the order.</p>{error && <button className="btn btn--secondary" onClick={() => run(async () => { await market.model.getPrices({ force: true }); setOrder(api.execute(order.id, wallet)); })}>Retry quote</button>}</div>}
      {status === "complete" && <div className="result"><div className="result__seal">✓</div><h3>{direction === "BUY" ? `Your ${token.symbol} Stock Tokens have arrived` : "Your USDC is available on Base"}</h3><p className="result__amount">+{outputText(order.quote)}</p><p>Available USDC: {formatUsdc(usdcText(balance), 4)}</p><button className="btn btn--primary btn--full" onClick={onClose}>Done</button></div>}
      {["cancelled", "expired", "funds_available"].includes(status) && <div className="result"><h3>{status === "expired" ? "Payment window expired" : "Your unspent USDC is available"}</h3><p>No new stock purchase will be made for this order.</p><p>Available: {formatUsdc(usdcText(balance), 4)}</p><button className="btn btn--secondary btn--full" onClick={onClose}>Back to stocks</button></div>}
      {error && <p className="field-error" role="alert">{error}</p>}
      {order && <p className="op-ref">Order reference: <code>{order.id}</code></p>}
    </div>}
  </Modal>;
}
