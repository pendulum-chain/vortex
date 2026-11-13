import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { LEGAL_URLS } from "@vortexfi/consumer-kit";
import { BRAND } from "./brand.js";
import { Modal } from "./components/Modal.jsx";
import { useMarket, useNow, usePortfolio, useRuntime } from "./hooks.js";
import { STOCK_TOKENS } from "./lib/stocks.js";
import { formatTokensEn, formatUsdc, formatUsd, BRAZIL_PATH } from "./lib/international.js";
import { localHistoryRows, mergeHistory } from "./lib/history.js";
import { useHashRoute } from "./router.js";
import { stockHash } from "./lib/routes.js";
import { formatUnits } from "viem";
import { saveReturnHash, takeReturnHash } from "./lib/stores.js";
import { FairFeesHero } from "./components/FairFeesHero.jsx";
import { PurchasePreview } from "./components/PurchasePreview.jsx";
import { clearPurchaseSelection, readPurchaseSelection, savePurchaseSelection } from "./lib/purchase-preview.js";

const UsdcFlow = lazy(() => import("./flows/UsdcFlow.jsx"));
const number = (raw) => Number(raw || 0n) / 1e18;
export default function InternationalApp({ auth, config }) {
  const market = useMarket(config);
  const [route, navigate] = useHashRoute();
  useNow(1000); // Keep simulated balance/order summaries current while the checkout runs.
  const { runtime, error: runtimeError } = useRuntime(auth.authenticated, config, market.model);
  const portfolio = usePortfolio({ runtime, address: auth.address, prices: market.state.prices });
  const [modal, setModal] = useState(null);
  const [query, setQuery] = useState("");
  const [serverHistory, setServerHistory] = useState(null);
  const [version, setVersion] = useState(0);
  const intent = useRef(null);
  const signed = auth.authenticated;
  const pending = runtime && auth.address ? runtime.activeRampStore.get(auth.address) : null;
  const selected = route.name === "stock" ? STOCK_TOKENS.find((t) => t.symbol === route.symbol) : null;
  const visible = STOCK_TOKENS.filter((t) => `${t.symbol} ${t.underlyingName}`.toLowerCase().includes(query.toLowerCase()));
  const usdc = runtime?.usdc;
  const holdings = signed && auth.address && usdc?.enabled && usdc.simulated !== false ? usdc.positions(auth.address).filter((h) => h.raw > 0n) : portfolio.valued?.holdings || [];
  const totalUsd = holdings.reduce((sum, h) => sum + number(h.raw) * (market.state.prices[h.symbol]?.usd || 0), 0);
  useEffect(() => {
    if (!signed || !auth.address || usdc?.simulated !== false) return;
    let alive = true;
    const refresh = () => usdc.refreshBalance(auth.address).then(() => { if (alive) setVersion(v => v + 1); }).catch(() => {});
    refresh(); const timer = setInterval(refresh, 15000); return () => { alive = false; clearInterval(timer); };
  }, [signed, auth.address, usdc]);
  const balance = signed && auth.address && usdc?.enabled ? Number(usdc.balanceRaw(auth.address)) / 1e6 : null;
  const history = signed && auth.address && usdc?.enabled && usdc.simulated !== false ? usdc.history(auth.address) : [];
  const liveHistory = signed && auth.address && usdc?.simulated === false
    ? mergeHistory(localHistoryRows(runtime.activeRampStore.history(auth.address)), serverHistory?.owner === auth.address ? serverHistory.rows : []) : [];
  useEffect(() => {
    if (!runtime || !signed || !auth.address || usdc?.simulated !== false) return;
    let current = true;
    const refresh = () => runtime.serverHistory({ email: auth.user?.email, privyDid: auth.user?.privyDid }).then(rows => { if (current && rows) setServerHistory({ owner: auth.address, rows }); }).catch(() => {});
    refresh(); const timer = setInterval(refresh, 15000); return () => { current = false; clearInterval(timer); };
  }, [runtime, signed, auth.address, version]);
  useEffect(() => { document.documentElement.lang = "en"; document.title = `${BRAND.lockupAlt} — Stock Tokens with USDC`; }, []);
  useEffect(() => {
    if (!auth.authenticated) return;
    const back = takeReturnHash(); if (back) navigate(back);
    const saved = readPurchaseSelection({ locale: "en" });
    const next = intent.current || (saved && { type: "checkout", symbol: saved.symbol, direction: "BUY", initialAmount: saved.amount });
    intent.current = null;
    if (next) { clearPurchaseSelection(); if (next.type === "checkout") setModal(next); else setModal(null); }
  }, [auth.authenticated]);
  const lastOwner = useRef(auth.user?.privyDid);
  useEffect(() => {
    const did = auth.user?.privyDid;
    if (lastOwner.current && did !== lastOwner.current) { intent.current = null; clearPurchaseSelection(); setModal(null); }
    lastOwner.current = did;
  }, [auth.user?.privyDid]);
  async function login(method) {
    if (!intent.current && !readPurchaseSelection({ locale: "en" })) intent.current = { type: "signed-in" };
    if (auth.kind === "privy") {
      saveReturnHash(window.location.hash);
      if (window.location.hash !== "#/") navigate("#/");
      setModal(null);
    }
    await auth.login(method);
  }
  function start(symbol, direction = "BUY", initialAmount) {
    const next = { type: "checkout", symbol, direction, initialAmount };
    if (!signed) { intent.current = next; setModal({ type: "login" }); return; }
    if (pending) {
      if (pending.paymentMethod !== "usdc") { setModal({ type: "pix-pending" }); return; }
      setModal({ type: "checkout", symbol: pending.symbol, direction: pending.rampType, resume: pending }); return;
    }
    setModal(next);
  }
  const startPreview = selection => {
    if (!signed) {
      savePurchaseSelection(selection);
      intent.current = null; // The validated, expiring per-tab draft carries the selection through sign-in.
      setModal({ type: "login" });
      return;
    }
    start(selection.symbol, "BUY", selection.amount);
  };
  // All entry points, including a restored OAuth selection, honour the one-operation lock.
  useEffect(() => {
    if (modal?.type !== "checkout" || modal.checked || !runtime || !auth.address) return;
    const active = runtime.activeRampStore.get(auth.address);
    if (active && active.paymentMethod !== "usdc") { setModal({ type: "pix-pending" }); return; }
    setModal(active ? { type: "checkout", symbol: active.symbol, direction: active.rampType, resume: active, checked: true } : { ...modal, checked: true });
  }, [modal, runtime, auth.address]);
  const close = () => { setModal(null); setVersion(version + 1); portfolio.refresh(); };
  const token = modal?.symbol ? STOCK_TOKENS.find((t) => t.symbol === modal.symbol) : null;
  const busyAuth = auth.status === "loading" || Boolean(auth.queued);
  return <div lang="en">
    <a className="skip-link" href="#conteudo">Skip to content</a>
    {config.mode !== "live" && <div className="mode-banner" role="note"><b>Simulation.</b> Prices and payments are illustrative. No real money moves.</div>}
    <header className="site-header"><div className="wrap site-header__inner">
      <a className="brand" href="#/" aria-label={`${BRAND.lockupAlt}, home`}><img src={`${import.meta.env.BASE_URL}${BRAND.assets.wordmark}`} width="88" height="42" alt={BRAND.name} /><span className="brand__by">{BRAND.endorsement}</span></a>
      <nav className="site-nav" aria-label="Main"><a href="#/">Stocks</a>{signed && <a href="#portfolio">Portfolio</a>}</nav>
      <div className="site-header__right"><a className="link locale-switch" href={BRAZIL_PATH}>Brasil · Pix</a>{signed ? <button className="btn btn--secondary" onClick={async () => { clearPurchaseSelection(); intent.current = null; await auth.logout(); setModal(null); }}>Sign out</button> : <button className="btn btn--secondary" disabled={busyAuth} onClick={() => setModal({ type: "login" })}>{busyAuth ? "Preparing sign-in…" : "Sign in with Vortex"}</button>}</div>
    </div></header>
    <main id="conteudo" tabIndex={-1} className="wrap page international-page">
      {!selected && <>
        <FairFeesHero locale="en" previewId="preview-purchase" contained buyOpen={config.usdcEnabled} />
        <div className="fair-preview">
          <PurchasePreview id="preview-purchase" prices={market.state.prices} locale="en" onContinue={startPreview} canContinue={() => config.usdcEnabled || config.mode !== "live"} />
        </div>
        <p className="hint">Bank payments are planned.</p>
      </>}
      {pending && <section className="notice notice--info" role="status"><b>You have an unfinished {pending.paymentMethod === "usdc" ? "USDC" : "Pix"} order.</b><button className="btn btn--secondary" onClick={() => start(pending.symbol)}>Resume order</button></section>}
      {signed && <section className="section" id="portfolio"><div className="section__head"><div><p className="eyebrow">Your wallet</p><h2 className="section__title">Portfolio</h2></div><div><b>{portfolio.valued || usdc?.enabled ? formatUsd(totalUsd) : "—"}</b><p className="hint">Available Base USDC: {balance === null ? "—" : formatUsdc(balance, 4)}</p></div></div>
        {holdings.length ? <div className="card international-holdings">{holdings.map((h) => <div key={h.symbol}><span><b>{h.symbol}</b><small>{formatTokensEn(formatUnits(BigInt(h.raw), 18))} tokens</small></span><b>{formatUsd(number(h.raw) * market.state.prices[h.symbol]?.usd)}</b><button className="btn btn--secondary" onClick={() => start(h.symbol, "SELL")}>Sell for USDC</button></div>)}</div> : <p className="hint">Your Stock Tokens appear here after a completed purchase.</p>}
      </section>}
      {selected ? <section className="section"><a className="back-link" href="#/">← All stocks</a><div className="detail-head"><div className="ticker-tile ticker-tile--lg">{selected.symbol}</div><div><h1>{selected.underlyingName}</h1><p>Stock Token · Robinhood Chain</p></div></div><p className="price-block__value">{formatUsd(market.state.prices[selected.symbol]?.usd)}</p><p className="source-line">{config.prices === "demo" ? "Illustrative demo price" : "Reference: CoinGecko · execution price shown in the quote"}</p><p className="preview-minimum">Price of one token. Buy a fraction from 10 USDC.</p><div className="international-detail-preview"><PurchasePreview key={selected.symbol} symbol={selected.symbol} prices={market.state.prices} locale="en" onContinue={startPreview} canContinue={() => config.usdcEnabled || config.mode !== "live"} /></div>{signed && <button className="btn btn--secondary btn--lg" onClick={() => start(selected.symbol, "SELL")}>Sell for USDC</button>}</section> : <section className="section"><div className="section__head"><div><p className="eyebrow">Explore</p><h2 className="section__title">Choose your next slice.</h2><p className="hint">Buy fractions from 10 USDC. Prices below are per token.</p></div><label className="international-search">Search stocks<input value={query} onChange={(e) => setQuery(e.target.value.slice(0, 60))} placeholder="Nvidia, Apple, S&P 500…" /></label></div><div className="card international-stocks">{visible.map((t) => <div key={t.symbol}><a href={stockHash(t.symbol)}><span className="ticker-tile">{t.symbol}</span><span><b>{t.underlyingName}</b><small>Stock Token</small></span></a><span className="mono">{formatUsd(market.state.prices[t.symbol]?.usd)}</span><button className="btn btn--secondary" onClick={() => navigate(stockHash(t.symbol))}>Preview</button></div>)}</div><p className="source-line">{config.prices === "demo" ? "Illustrative prices for this simulation." : "Reference prices: CoinGecko. The executable quote determines the purchase price."}</p></section>}
      {liveHistory.length > 0 && <section className="section"><h2 className="section__title">Recent activity</h2><div className="card international-holdings">{liveHistory.map(row => <div key={row.id}><b>{row.direction === "BUY" ? "Buy" : "Sell"} {row.symbol}</b><span>{row.paymentMethod === "usdc" ? formatUsdc(row.usdcAmount, 6) : "Pix"}</span><small>{row.status} · {row.id}</small></div>)}</div></section>}
      {history.length > 0 && <section className="section"><h2 className="section__title">Recent activity</h2><div className="card international-holdings">{history.map((o) => <div key={o.id}><b>{o.direction === "BUY" ? "Bought" : "Sold"} {o.symbol}</b><span>{formatUsdc(Number(o.direction === "BUY" ? o.quote.grossRaw : o.quote.outputRaw) / 1e6, 4)}</span><small>Completed · simulation</small></div>)}</div></section>}
      <section className="card card__body international-notes"><h2>Your costs, clear before you pay.</h2><p>See what you pay, the costs included and how many tokens you receive before confirming. You can fund a purchase with USDC on Base from a wallet or exchange. To sell, review a new quote and receive USDC.</p><details><summary>Providers, wallet and fees</summary><p>Your tokens are delivered to your wallet on Robinhood Chain. Relay handles the transfer between networks and Uniswap the token purchase. Vortex charges a service fee; {BRAND.name} adds no extra fee. Provider fees, network fees and any reserve for future network fees are itemised in your quote. Your sending wallet or exchange may charge separately.</p></details><p>Availability depends on the asset and your country. Stock Tokens are not offered in the United States or to US persons and have further country restrictions.</p><a className="link" href="https://docs.robinhood.com/chain/stock-tokens/" target="_blank" rel="noreferrer">Read about Stock Tokens ↗</a></section>
    </main>
    <footer className="wrap international-footer"><b>{BRAND.lockupAlt}</b><span>Stock Tokens · USDC on Base</span><a href={LEGAL_URLS.termsAndConditionsUrl} target="_blank" rel="noreferrer">Terms</a><a href={LEGAL_URLS.privacyPolicyUrl} target="_blank" rel="noreferrer">Privacy</a><a href={BRAZIL_PATH}>Brasil · Pix</a></footer>
    {modal?.type === "login" && <Modal title="Sign in with Vortex" closeLabel="Close" onClose={() => { intent.current = null; clearPurchaseSelection(); setModal(null); }}><div className="flow-section"><p>Sign in to continue. Review a fresh quote before making any payment. Use Google or an email code, with no new password.</p>{["google", "email"].map((method) => <button key={method} className="btn btn--secondary btn--full btn--lg" disabled={busyAuth} onClick={() => login(method)}>{method === "google" ? "Continue with Google" : "Continue with email"}</button>)}<p className="hint">Already use Gold? Use the same sign-in.</p>{config.mode === "demo" && <p className="demo-hint">Demo sign-in. No credentials are requested.</p>}<p className="legal-note">By continuing, you accept the <a href={LEGAL_URLS.termsAndConditionsUrl} target="_blank" rel="noreferrer">Terms</a> and <a href={LEGAL_URLS.privacyPolicyUrl} target="_blank" rel="noreferrer">Privacy Policy</a>.</p></div></Modal>}
    {modal?.type === "pix-pending" && <Modal title="Resume your Pix order" closeLabel="Close" onClose={close}><p>Complete your existing Pix order before starting another purchase.</p><a className="btn btn--primary" href={BRAZIL_PATH}>Go to Brazil checkout</a></Modal>}
    {modal?.type === "checkout" && token && (runtime && auth.address && modal.checked ? <Suspense fallback={<p role="status">Preparing checkout…</p>}><UsdcFlow key={modal.resume?.rampId || `${token.symbol}-${modal.direction}`} token={token} auth={auth} runtime={runtime} market={market} direction={modal.direction} resume={modal.resume} initialAmount={modal.initialAmount} onClose={close} onSettled={() => { portfolio.refreshSoon(); setVersion((v) => v + 1); }} /></Suspense> : <Modal title={runtimeError ? "Checkout could not load" : "Preparing your wallet…"} closeLabel="Close" onClose={close}><p>{runtimeError ? "Reload and resume your order before attempting another payment." : "Your checkout will open when the wallet is ready."}</p></Modal>)}
  </div>;
}
