import React, { lazy, Suspense, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import { ErrorBoundary } from "./ErrorBoundary.jsx";
import { hasPrivySession } from "./lib/privy-session.js";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/cormorant-garamond/400.css";
import "@fontsource/cormorant-garamond/500.css";
import "./styles.css";

const isDemo = import.meta.env.VITE_DEMO_MODE !== "false";
const privyAppId = import.meta.env.VITE_PRIVY_APP_ID || "";
const PrivyShell = lazy(() => import("./PrivyShell.jsx").then((module) => ({ default: module.PrivyShell })));
const PENDING_AUTH = { ready: false, authenticated: false, user: null, address: null, login: () => {}, logout: async () => {} };
const hadPrivySession = (() => { try { return hasPrivySession(Object.keys(localStorage), location.search); } catch { return false; } })();
const loader = <div className="app-loading"><span><b>ouro<span className="gold-period">.</span></b><i /></span></div>;

// The landing renders at once; the ~1 MB Privy chunk loads beside it and hands its auth state up.
function PrivyApp() {
  const [auth, setAuth] = useState(PENDING_AUTH);
  // Created once: re-rendering Privy on every auth update would hand back new callbacks and loop. A state
  // initializer, unlike useMemo, is guaranteed to be kept.
  const [privy] = useState(() => <Suspense fallback={null}><PrivyShell appId={privyAppId} onAuth={setAuth} /></Suspense>);
  // A Privy that failed to initialize never becomes ready, so stop waiting and let the login explain it.
  return <>{!auth.ready && !auth.error && hadPrivySession ? loader : <App auth={auth} demo={false} />}{privy}</>;
}

function DemoShell() {
  const [authenticated, setAuthenticated] = useState(false);
  const auth = useMemo(() => ({
    authenticated,
    user: authenticated ? { name: "Ana Silva", firstName: "Ana", email: "ana.silva@example.com" } : null,
    address: authenticated ? "0x71c2F3a68790eAd79216dBE733fb83aF089C93a4" : null,
    login: async () => { await new Promise((resolve) => setTimeout(resolve, 550)); setAuthenticated(true); },
    logout: async () => setAuthenticated(false),
  }), [authenticated]);
  return <App auth={auth} demo />;
}

createRoot(document.getElementById("root")).render(<React.StrictMode><ErrorBoundary>{isDemo ? <DemoShell /> : privyAppId ? <PrivyApp /> : <div className="config-error">VITE_PRIVY_APP_ID não configurado.</div>}</ErrorBoundary></React.StrictMode>);
