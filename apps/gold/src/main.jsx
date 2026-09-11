import React, { lazy, Suspense, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import { ErrorBoundary } from "./ErrorBoundary.jsx";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/cormorant-garamond/400.css";
import "@fontsource/cormorant-garamond/500.css";
import "./styles.css";

const isDemo = import.meta.env.VITE_DEMO_MODE !== "false";
const privyAppId = import.meta.env.VITE_PRIVY_APP_ID || "";
const PrivyShell = lazy(() => import("./PrivyShell.jsx").then((module) => ({ default: module.PrivyShell })));

function DemoShell() {
  const [authenticated, setAuthenticated] = useState(false);
  const auth = useMemo(() => ({
    authenticated,
    user: authenticated ? { name: "Ana Silva", firstName: "Ana", email: "ana.silva@gmail.com" } : null,
    address: authenticated ? "0x71c2F3a68790eAd79216dBE733fb83aF089C93a4" : null,
    login: async () => { await new Promise((resolve) => setTimeout(resolve, 550)); setAuthenticated(true); },
    logout: async () => setAuthenticated(false),
  }), [authenticated]);
  return <App auth={auth} demo />;
}

createRoot(document.getElementById("root")).render(<React.StrictMode><ErrorBoundary>{isDemo ? <DemoShell /> : privyAppId ? <Suspense fallback={<div className="app-loading"><span><b>ouro<span className="gold-period">.</span></b><i /></span></div>}><PrivyShell appId={privyAppId} /></Suspense> : <div className="config-error">VITE_PRIVY_APP_ID não configurado.</div>}</ErrorBoundary></React.StrictMode>);
