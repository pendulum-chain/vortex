// The app shell: routes, data hooks, sign-in and the flow modals. Works the same with the demo
// sign-in and with the shared Privy sign-in (ConsumerAuth from PrivyShell).
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { local } from "@vortexfi/consumer-kit";
import { BRAND } from "./brand.js";
import { AppHeader, TabBar } from "./components/AppHeader.jsx";
import { LearnSheet } from "./components/LearnSheet.jsx";
import { LoginSheet } from "./components/Login.jsx";
import { Modal } from "./components/Modal.jsx";
import { SiteFooter } from "./components/SiteFooter.jsx";
import { DEMO_USER } from "./DemoAuth.js";
import { WelcomeSheet } from "./components/Welcome.jsx";
import { useAvailability, useMarket, useNow, useOnline, usePendingRampRead, usePortfolio, useRuntime } from "./hooks.js";
import { DEMO_TOOLS, USDC_CHECKOUT } from "./lib/config.js";
import { flowFor } from "./lib/detail-actions.js";
import { localHistoryRows, mergeHistory, ownedHistoryRows } from "./lib/history.js";
import { homeHash, parseHash, stockHash } from "./lib/routes.js";
import { findStock } from "./lib/stocks.js";
import { clearPurchaseSelection, readPurchaseSelection, savePurchaseSelection } from "./lib/purchase-preview.js";
import { STOCKS_KEYS, createWelcomeStore, saveReturnHash, takeReturnHash } from "./lib/stores.js";
import { useHashRoute } from "./router.js";
import { Explore } from "./screens/Explore.jsx";
import { History } from "./screens/History.jsx";
import { Home } from "./screens/Home.jsx";
import { Landing } from "./screens/Landing.jsx";
import { StockDetail } from "./screens/StockDetail.jsx";

const BuyFlow = lazy(() => import("./flows/BuyFlow.jsx"));
const DEFAULT_TITLE = typeof document === "undefined" ? "" : document.title;
const SellFlow = lazy(() => import("./flows/SellFlow.jsx"));
const UsdcFlow = USDC_CHECKOUT ? lazy(() => import("./flows/UsdcFlow.jsx")) : null;

function ModeBanner({ mode }) {
  if (mode === "demo") return <div className="mode-banner" role="note"><span><b>Ambiente de teste.</b> Nenhuma transação real: acesso, preços e Pix são simulados.</span></div>;
  if (mode === "preview") return <div className="mode-banner" role="note"><span><b>Simulação:</b> nenhum dinheiro é movimentado.</span></div>;
  return null;
}

function FlowLoading({ onClose, error }) {
  return (
    <Modal title={error ? "Não foi possível abrir" : "Um momento…"} onClose={onClose}>
      {error ? <p className="muted">Não conseguimos carregar esta etapa. Verifique sua conexão e atualize a página.</p>
        : <div className="result"><span className="result__seal result__seal--wait"><span className="spinner" style={{ width: 28, height: 28 }} aria-hidden="true" /></span><p>Preparando sua carteira e a cotação.</p></div>}
    </Modal>
  );
}

export function App({ auth, config }) {
  const [route, navigate] = useHashRoute();
  const usdcCheckout = config.mode !== "live";
  const isFlow = (type) => type === "buy" || type === "sell" || (type === "usdc" && usdcCheckout);
  const market = useMarket(config);
  const now = useNow(30_000);
  const online = useOnline();
  const signedIn = auth.authenticated;
  const address = signedIn ? auth.address : null;
  // Signed out, the live ramp's answer is needed only where it changes the page: the landing CTA and a detail screen.
  const needsRuntime = signedIn || (config.rampKind === "vortex" && config.rampEnabled && (route.name === "stock" || route.name === "home"));
  const { runtime, error: runtimeError } = useRuntime(needsRuntime, config, market.model);
  const portfolio = usePortfolio({ runtime: signedIn ? runtime : null, address, prices: market.state.prices });
  const { availability, comingSoon, rampOpen } = useAvailability({ config, runtime, flags: portfolio.flags });
  const [modal, setModal] = useState(null);
  const [pendingLogin, setPendingLogin] = useState("");
  const [hidden, setHidden] = useState(() => local.get(STOCKS_KEYS.hideBalance, false) === true);
  const [version, setVersion] = useState(0);
  const [serverRows, setServerRows] = useState(null);
  const [demoPlan, setDemoPlan] = useState(null);
  const intent = useRef(null);
  const welcome = useMemo(() => createWelcomeStore(), []);
  const refreshLocal = useCallback(() => setVersion((value) => value + 1), []);

  // The active ramp (resume banner) and the device history; the adapter writes them, we only read.
  const pending = useMemo(() => (runtime && address ? runtime.activeRampStore.get(address) : null), [runtime, address, version, modal, now]);
  const localRows = useMemo(() => (runtime && address ? localHistoryRows(runtime.activeRampStore.history(address)) : []), [runtime, address, version, modal]);
  usePendingRampRead({ runtime, rampId: pending?.rampId, walletAddress: address, who: { email: auth.user?.email, privyDid: auth.user?.privyDid }, idle: !modal, onSettled: () => { portfolio.refreshSoon(); refreshLocal(); } });
  const historyOwner = `${auth.user?.privyDid ?? ""}:${address ?? ""}`;
  const historyRows = useMemo(() => mergeHistory(localRows, ownedHistoryRows(serverRows, historyOwner), pending?.rampId), [localRows, serverRows, historyOwner, pending?.rampId]);

  useEffect(() => {
    if (!runtime || !signedIn || !["home", "history"].includes(route.name)) return undefined; // both list the rows
    let alive = true;
    runtime.serverHistory({ email: auth.user?.email, privyDid: auth.user?.privyDid }).then((rows) => { if (alive) setServerRows({ owner: historyOwner, rows }); }, () => { if (alive) setServerRows(null); });
    return () => { alive = false; };
  }, [runtime, signedIn, route.name, auth.user?.email, auth.user?.privyDid, historyOwner, version]);

  // A title per screen (tabs, history, screen readers).
  useEffect(() => {
    const token = route.name === "stock" ? findStock(route.symbol) : null;
    const prefix = token ? `${token.namePt} (${token.symbol})` : route.name === "explore" ? "Explorar" : route.name === "history" ? "Histórico" : null;
    document.title = prefix ? `${prefix} · ${BRAND.lockupAlt}` : DEFAULT_TITLE;
  }, [route.name, route.symbol]);

  // New route: top of the page and focus on the content (screen readers hear the new screen).
  const screenKey = `${route.name}:${route.symbol || ""}:${route.collection || ""}`;
  const firstScreen = useRef(true);
  useEffect(() => {
    if (firstScreen.current) { firstScreen.current = false; return; }
    window.scrollTo(0, 0);
    document.getElementById("conteudo")?.focus({ preventScroll: true });
  }, [screenKey]);

  const runIntent = useCallback(() => {
    const saved = readPurchaseSelection({ locale: "pt-BR" });
    const next = intent.current || (saved && { type: saved.method === "pix" ? "buy" : "usdc", symbol: saved.symbol, initialAmount: saved.amount });
    intent.current = null;
    if (!next) return;
    clearPurchaseSelection();
    navigate(stockHash(next.symbol));
    if (isFlow(next.type)) setModal(next);
  }, [navigate]);

  // Signed in (after the sheet, after an OAuth return, or a session found on load): restore the
  // route, welcome a new user on this device, then continue what they were doing.
  const wasSignedIn = useRef(false);
  useEffect(() => {
    if (signedIn && !wasSignedIn.current) {
      const back = takeReturnHash();
      if (back) navigate(back);
      const did = auth.user?.privyDid;
      if (intent.current || readPurchaseSelection({ locale: "pt-BR" })) { if (did) welcome.mark(did); runIntent(); }
      else if (did && !welcome.has(did)) setModal({ type: "welcome" });
      else runIntent();
    }
    if (!signedIn && wasSignedIn.current) { intent.current = null; clearPurchaseSelection(); setModal(null); setServerRows(null); }
    wasSignedIn.current = signedIn;
  }, [signedIn]);

  // Another Privy user in this tab: close any open flow (the kit clears the Vortex session).
  const lastDid = useRef(auth.user?.privyDid);
  useEffect(() => {
    const did = auth.user?.privyDid;
    if (lastDid.current && did && lastDid.current !== did) setModal(null);
    if (did) lastDid.current = did;
  }, [auth.user?.privyDid]);

  // Demo builds only: ?demoFlow= deep links (src/lib/demo-links.js). Compiled out of preview/live.
  useEffect(() => {
    if (!DEMO_TOOLS || config.mode !== "demo") return undefined;
    let alive = true;
    const read = () => import("./lib/demo-links.js").then(({ parseDemoFlow, planDemoFlow, withoutDemoFlow }) => {
      const flow = alive ? parseDemoFlow(window.location.hash) : null;
      if (!flow) return;
      window.history.replaceState(window.history.state, "", withoutDemoFlow(window.location.hash));
      const current = parseHash(window.location.hash);
      setDemoPlan(planDemoFlow(flow, { signedIn: wasSignedIn.current, symbol: current.name === "stock" ? current.symbol : null }));
    });
    read();
    window.addEventListener("hashchange", read);
    return () => { alive = false; window.removeEventListener("hashchange", read); };
  }, [config.mode]);
  useEffect(() => {
    if (!DEMO_TOOLS || !demoPlan) return;
    if (demoPlan.signIn && !signedIn) {
      welcome.mark(DEMO_USER.privyDid); // the deep link shows its own screen, not the first-visit welcome
      if (auth.status === "anonymous") auth.login("google");
      return;
    }
    if (demoPlan.needsHoldings && !portfolio.valued) return;
    setDemoPlan(null);
    if (demoPlan.route) navigate(demoPlan.route);
    setModal(demoPlan.modal);
  }, [demoPlan, signedIn, portfolio.valued]);

  // Every buy or sell request (button, sign-in intent, resume banner, demo link) is checked against
  // this device's recovery record first: while the wallet has an unfinished operation, it resumes
  // that one (flowFor) instead of starting a second one that would overwrite its record. Decided
  // once the runtime (and so the store) is loaded; the flow shows FlowLoading until then.
  useEffect(() => {
    if (!isFlow(modal?.type) || modal.checked || !runtime || !address) return;
    setModal({ ...modal, ...flowFor(modal, runtime.activeRampStore.get(address)), checked: true });
  }, [modal, runtime, address]);

  const openLogin = useCallback((next = null) => { intent.current = next; setModal({ type: "login" }); }, []);
  const startLogin = async (method) => {
    if (auth.kind === "privy") {
      // Privy's OAuth return with a hash route is unverified: remember it and start from #/.
      saveReturnHash(window.location.hash);
      if (window.location.hash && window.location.hash !== homeHash()) navigate(homeHash());
      setModal(null);
      await auth.login(method);
      return;
    }
    setPendingLogin(method);
    try { await auth.login(method); setModal((current) => (current?.type === "login" ? null : current)); }
    finally { setPendingLogin(""); }
  };
  const closeWelcome = () => {
    if (auth.user?.privyDid) welcome.mark(auth.user.privyDid);
    setModal(null);
    runIntent();
  };
  const logout = async () => {
    setModal(null);
    await auth.logout();
    navigate(homeHash());
  };
  const resetDemo = () => {
    runtime?.resetDemo();
    portfolio.refresh();
    refreshLocal();
    navigate(homeHash());
  };
  const toggleHidden = () => setHidden((value) => { local.set(STOCKS_KEYS.hideBalance, !value); return !value; });
  const startFlow = (type, symbol) => {
    if (!signedIn) { openLogin({ type, symbol }); return; }
    setModal({ type, symbol });
  };
  const startPreview = (selection) => {
    const next = { type: selection.method === "pix" ? "buy" : "usdc", symbol: selection.symbol, initialAmount: selection.amount };
    if (!signedIn) { savePurchaseSelection(selection); openLogin(); return; }
    navigate(stockHash(selection.symbol));
    setModal(next);
  };
  const canPreviewContinue = selection => selection.method === "pix" ? rampOpen : usdcCheckout;
  const resume = () => { if (pending) setModal({ type: pending.paymentMethod === "usdc" ? "usdc" : pending.rampType === "SELL" ? "sell" : "buy", symbol: pending.symbol }); };
  const closeFlow = () => { setModal(null); refreshLocal(); portfolio.refresh(); };
  const onSettled = () => { portfolio.refreshSoon(); refreshLocal(); };

  let screen;
  if (route.name === "stock") {
    screen = <StockDetail key={route.symbol} symbol={route.symbol} auth={auth} market={market} portfolio={portfolio} availability={availability} comingSoon={comingSoon} pending={pending} onBuy={() => startFlow("buy", route.symbol)} onPreview={startPreview} canPreviewContinue={canPreviewContinue} onSell={() => startFlow("sell", route.symbol)} now={now} />;
  } else if (route.name === "explore") {
    screen = <Explore route={route} market={market} navigate={navigate} now={now} />;
  } else if (route.name === "history") {
    screen = <History auth={auth} rows={historyRows} loading={signedIn && !runtime} pending={pending} onResume={resume} onLogin={() => openLogin()} serverNote={runtime?.adapter.kind === "vortex" && runtime.adapter.enabled && !(serverRows?.owner === historyOwner && Array.isArray(serverRows.rows))} simulated={config.rampKind === "simulated"} />;
  } else if (signedIn) {
    screen = <Home auth={auth} market={market} portfolio={portfolio} rampOpen={rampOpen} pending={pending} onResume={resume} historyRows={historyRows} hidden={hidden} onToggleHide={toggleHidden} now={now} runtimeError={runtimeError} />;
  } else {
    screen = <Landing market={market} rampOpen={rampOpen} onPreview={startPreview} canPreviewContinue={canPreviewContinue} onLearn={() => setModal({ type: "learn" })} now={now} />;
  }

  // A resumed record may name a token a later build no longer bundles: resuming needs only its symbol,
  // so it still opens (status, code, settling) instead of rendering nothing while it holds the wallet.
  const flowToken = modal && isFlow(modal.type) ? findStock(modal.symbol) ?? (modal.resume?.symbol ? { symbol: modal.resume.symbol, namePt: modal.resume.symbol, type: "stock", address: modal.resume.tokenAddress ?? null } : null) : null;
  const holding = flowToken ? portfolio.valued?.holdings.find((item) => item.symbol === flowToken.symbol) : null;
  const showTabBar = signedIn && route.name !== "stock";

  return (
    <div className={showTabBar ? "has-tabbar" : undefined}>
      <button className="skip-link" type="button" onClick={() => document.getElementById("conteudo")?.focus()}>Pular para o conteúdo</button>
      <ModeBanner mode={config.mode} />
      {!online && <div className="offline-banner" role="status">Você está sem conexão. Os preços podem estar desatualizados.</div>}
      <AppHeader auth={auth} route={route} demo={config.mode === "demo"} usdcCheckout={usdcCheckout} onLogin={() => openLogin()} onLogout={logout} onResetDemo={resetDemo} pendingLogin={pendingLogin} />
      {screen}
      <SiteFooter signedIn={signedIn} />
      {showTabBar && <TabBar route={route} />}

      {modal?.type === "login" && <LoginSheet onClose={() => { intent.current = null; clearPurchaseSelection(); setModal(null); }} onLogin={startLogin} pending={pendingLogin} demo={auth.kind === "demo"} />}
      {modal?.type === "welcome" && <WelcomeSheet firstName={auth.user?.firstName} address={auth.address} onContinue={closeWelcome} continueLabel={intent.current ? "Continuar" : "Ver meu painel"} rampOpen={rampOpen} />}
      {modal?.type === "learn" && <LearnSheet onClose={() => setModal(null)} rampOpen={rampOpen} />}
      {flowToken && (runtime && auth.address && modal.checked
        ? (
          <Suspense fallback={<FlowLoading onClose={() => setModal(null)} />}>
            {modal.type === "usdc" ? <UsdcFlow key={modal.resume?.rampId || flowToken.symbol} token={flowToken} auth={auth} runtime={runtime} market={market} direction={modal.resume?.rampType || "BUY"} resume={modal.resume} initialAmount={modal.initialAmount} onClose={closeFlow} onSettled={onSettled} /> : modal.type === "buy"
              ? <BuyFlow key={modal.resume?.rampId || flowToken.symbol} token={flowToken} auth={auth} runtime={runtime} market={market} flags={portfolio.flags} resume={modal.resume ?? null} initialAmount={modal.initialAmount} demoQuote={modal.demoQuote === true} onClose={closeFlow} onSettled={onSettled} onPayUsdc={usdcCheckout ? () => setModal({ type: "usdc", symbol: flowToken.symbol }) : undefined} />
              : <SellFlow key={modal.resume?.rampId || flowToken.symbol} token={flowToken} auth={auth} runtime={runtime} market={market} flags={portfolio.flags} holdingRaw={holding?.raw ?? 0n} resume={modal.resume ?? null} demoReserveUsed={modal.demoReserveUsed === true} onClose={closeFlow} onSettled={onSettled} />}
          </Suspense>
        )
        : <FlowLoading onClose={() => setModal(null)} error={runtimeError} />)}
    </div>
  );
}
