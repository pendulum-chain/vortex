// Local browser fixture only. No real wallet, provider, API or payment call exists here.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { BaseGoldFlow } from "../../src/BaseGoldFlow.jsx";
import { setVortexSession } from "../../src/lib/vortex.js";
import "@fontsource/dm-sans/400.css";
import "@fontsource/cormorant-garamond/400.css";
import "../../src/styles.css";
const owner = "0x0000000000000000000000000000000000000001";
setVortexSession({ access_token: "synthetic-not-an-auth-token", email: "qa@example.com" });
const direction = new URLSearchParams(location.search).get("direction") === "SELL" ? "SELL" : "BUY";
let balance = 0n, registered = 0, started = false;
const adapter = {
  isEnabled: () => true,
  balance: async () => balance,
  quote: async ({ direction, paymentMethod, amount }) => ({ id: "synthetic-quote", inputAmount: amount, outputAmount: direction === "BUY" ? "0.002" : "9.5", grams: direction === "BUY" ? 0.0622069536 : Number(amount) * 31.1034768, processingFeeFiat: "0.10", partnerFeeFiat: "0", networkFeeFiat: "0.20", expiresAt: Date.now() + 60000, direction, paymentMethod, currency: "USDC" }),
  register: async ({ quote, onRegistered }) => { registered++; const r = { id: "synthetic-order", inputAmount: quote.inputAmount, outputAmount: quote.outputAmount }; onRegistered(r); return r; },
  start: async () => { started = true; return { id: "synthetic-order", currentPhase: "swapping" }; },
  getRamp: async () => ({ id: "synthetic-order", currentPhase: started ? "complete" : "initial", outputAmount: direction === "BUY" ? "0.002" : "9.5" }),
};
function Modal({ title, children }) {
  const [updates, setUpdates] = useState(0);
  return <div className="modal-backdrop"><section className="sheet sheet--wide" role="dialog" aria-label={title}><p className="demo-banner">SYNTHETIC ONLY · no real funds</p><h2>{title}</h2>{children}<div className="legal-note"><button onClick={() => { balance = 10_000_000n; setUpdates(n => n + 1); }}>Test: add 10 synthetic USDC</button><p>Registered orders: {registered} · Fixture updates: {updates}</p><a href="?direction=SELL">Test sell</a></div></section></div>;
}
const unused = () => <p>Unused identity fixture</p>;
const root = import.meta.hot?.data.root || createRoot(document.getElementById("root"));
if (import.meta.hot) import.meta.hot.data.root = root;
root.render(<BaseGoldFlow ui={{ Modal, OtpStep: unused, KycStep: unused, PixStep: unused }} adapter={adapter} direction={direction} paymentMethod="usdc" auth={{ address: owner, user: { email: "qa@example.com" }, getEthereumProvider: async () => ({}) }} onClose={() => {}} onComplete={() => {}} />);
