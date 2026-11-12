// Boot: the landing renders from this small entry. The Privy shell (~2 MB), the chart
// (recharts), the flows and the runtime (viem) are lazy chunks; the SDK is only ever loaded by the kit.
import { StrictMode, Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-600.css";
import "@fontsource/dm-mono/latin-400.css";
import "@fontsource/dm-mono/latin-500.css";
import "@fontsource/cormorant-garamond/latin-500-italic.css";
import "./styles.css";
import { App } from "./App.jsx";
import { useDemoAuth } from "./DemoAuth.js";
import { ErrorBoundary } from "./ErrorBoundary.jsx";
import { USDC_CHECKOUT, config } from "./lib/config.js";
import { pendingAuth } from "./auth-state.js";

const PrivyShell = lazy(() => import("./PrivyShell.jsx"));
const InternationalApp = USDC_CHECKOUT ? lazy(() => import("./InternationalApp.jsx")) : null;
function StocksApp(props) {
  return config.locale === "en" && InternationalApp ? <Suspense fallback={<main className="fatal">Loading stocks…</main>}><InternationalApp {...props} /></Suspense> : <App {...props} />;
}

// Privy keeps its session in localStorage["privy:token"] (a Privy internal): used ONLY to choose
// between "Entrar com Vortex" and "Abrindo sua conta…" while the Privy chunk loads (8 s cap).
function hasPrivySessionHint() {
  try { return Boolean(globalThis.localStorage?.getItem("privy:token")); } catch { return false; }
}
const HINT_CAP_MS = 8_000;

/** Render the landing while Privy loads and preserve the user's queued sign-in. */
function PrivyRoot() {
  const [privyAuth, setPrivyAuth] = useState(null);
  const [queued, setQueued] = useState(null);
  const [hint, setHint] = useState(hasPrivySessionHint);
  useEffect(() => { const timer = setTimeout(() => setHint(false), HINT_CAP_MS); return () => clearTimeout(timer); }, []);
  useEffect(() => {
    if (privyAuth?.error) { setQueued(null); return; }
    if (!privyAuth?.ready || !queued) return;
    setQueued(null);
    privyAuth.login(queued);
  }, [privyAuth, queued]);
  const queue = useCallback((method) => setQueued(method), []);
  const auth = useMemo(() => (privyAuth?.ready && !privyAuth.error ? privyAuth : pendingAuth({ returning: hint, queued, queue, error: privyAuth?.error })), [privyAuth, hint, queued, queue]);
  return (
    <>
      <StocksApp auth={auth} config={config} />
      {auth.error && <div className="mode-banner" role="alert"><span>{config.locale === "en" ? "Sign-in could not load. Check your connection and reload to try again." : "Não foi possível carregar o acesso. Verifique sua conexão e recarregue para tentar novamente."} <button type="button" onClick={() => window.location.reload()}>{config.locale === "en" ? "Reload" : "Recarregar"}</button></span></div>}
      <Suspense fallback={null}><PrivyShell appId={config.privyAppId} locale={config.locale} onAuthChange={setPrivyAuth} /></Suspense>
    </>
  );
}

function DemoRoot() {
  const auth = useDemoAuth();
  return <StocksApp auth={auth} config={config} />;
}

function ConfigError({ message }) {
  return (
    <main className="fatal">
      <h1>{config.locale === "en" ? "Invalid configuration" : "Configuração inválida"}</h1>
      <p>{message}</p>
    </main>
  );
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ErrorBoundary locale={config.locale}>
      {config.error ? <ConfigError message={config.error} /> : config.usesPrivy ? <PrivyRoot /> : <DemoRoot />}
    </ErrorBoundary>
  </StrictMode>,
);
