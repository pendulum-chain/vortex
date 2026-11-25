// The kit's wallet-connection bridge with Privy's hooks replaced: what settles connectFundingWallet.
// It lives here because the kit has no DOM or JSX tooling of its own.
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { robinhoodChain } from "@vortexfi/consumer-kit";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { transformWithEsbuild } from "vite";

const dom = new JSDOM("<!doctype html><div id=root></div>", { url: "http://localhost/pt-br/stocks/" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
const { createRoot } = await import("react-dom/client");

const PRIVY = `data:text/javascript,${encodeURIComponent(`
  const p = () => globalThis.fakePrivy;
  export const PrivyProvider = ({ children }) => children;
  export const usePrivy = () => ({ ready: true, authenticated: p().authenticated, user: p().authenticated ? { id: "did:privy:fake" } : null, login() {}, logout() {}, error: null });
  export const useWallets = () => ({ wallets: [] });
  export const useIdentityToken = () => ({ identityToken: null });
  export const useModalStatus = () => ({ isOpen: p().isOpen });
  export const useConnectWallet = callbacks => { p().callbacks = callbacks; return { connectWallet: options => { p().opened.push(options); } }; };
`)}`;
const url = new URL("../../../packages/consumer-kit/src/privy/ConsumerPrivyProvider.jsx", import.meta.url);
const { code } = await transformWithEsbuild(await readFile(url, "utf8"), fileURLToPath(url), { jsx: "automatic" });
const linked = code.replace(/from\s+["']([^"']+)["']/g, (_all, name) => `from ${JSON.stringify(
  name === "@privy-io/react-auth" ? PRIVY : name.startsWith(".") ? new URL(name, url).href : import.meta.resolve(name))}`);
const { ConsumerPrivyProvider } = await import(`data:text/javascript;base64,${Buffer.from(linked).toString("base64")}`);
const { createPrivyConfig } = await import(new URL("./config.js", url).href);

const external = { type: "ethereum", walletClientType: "metamask", address: "0x00000000000000000000000000000000000000d1" };
const config = externalWalletFunding => createPrivyConfig({ brand: { accentColor: "#3B38D0" }, defaultChain: robinhoodChain, externalWalletFunding });

async function harness(run, funding = true) {
  const privy = globalThis.fakePrivy = { authenticated: true, isOpen: false, opened: [], callbacks: null };
  const session = { clear() {} }, root = createRoot(document.getElementById("root"));
  let auth;
  const onAuthChange = next => { auth = next; };
  const settings = config(funding);
  // memo: only a new prop re-renders, so a counter stands in for Privy's own state changes.
  let version = 0;
  const commit = patch => {
    Object.assign(privy, patch);
    root.render(createElement(ConsumerPrivyProvider, { appId: "fake", config: settings, session, onAuthChange, version: ++version }));
  };
  const render = patch => act(async () => commit(patch));
  const renderNow = patch => { act(() => commit(patch)); };
  const connect = () => {
    const result = { settled: false };
    auth.connectFundingWallet("Choose").then(wallet => Object.assign(result, { settled: true, wallet }), error => Object.assign(result, { settled: true, error }));
    return result;
  };
  const tick = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
  let mounted = true;
  const unmount = () => act(async () => { if (mounted) { mounted = false; root.unmount(); } });
  await render();
  try { await run({ privy, render, renderNow, connect, tick, unmount, config: settings, auth: () => auth }); } finally { await unmount(); }
}

test("the picker offers exactly the wallets Privy was configured with", () => harness(async h => {
  h.connect();
  assert.ok(h.config.appearance.walletList.length);
  assert.deepEqual(h.privy.opened, [{ walletChainType: "ethereum-only", description: "Choose", walletList: h.config.appearance.walletList }]);
}));

test("without external funding there is nothing to connect", () => harness(async h => {
  assert.equal("connectFundingWallet" in h.auth(), false);
}, false));

test("closing the picker without an event ends the connection, and the next one works", () => harness(async h => {
  const first = h.connect();
  await h.render({ isOpen: true }); await h.tick();
  assert.equal(first.settled, false);
  await h.render({ isOpen: false }); await h.tick();
  assert.match(first.error.message, /cancelled/);
  const second = h.connect();
  await h.render({ isOpen: true });
  h.privy.callbacks.onSuccess({ wallet: external }); await h.tick();
  assert.equal(second.wallet, external);
  assert.equal(h.privy.opened.length, 2);
}));

test("a failed attempt keeps waiting while the picker is open, so its Retry still counts", () => harness(async h => {
  const result = h.connect();
  await h.render({ isOpen: true });
  h.privy.callbacks.onError?.("generic_connect_wallet_error"); await h.tick();
  assert.equal(result.settled, false);
  h.privy.callbacks.onSuccess({ wallet: external }); await h.tick();
  assert.equal(result.wallet, external);
}));

test("a success reported together with the close wins over it", () => harness(async h => {
  const result = h.connect();
  await h.render({ isOpen: true });
  h.renderNow({ isOpen: false });
  h.privy.callbacks.onSuccess({ wallet: external });
  await h.tick();
  assert.equal(result.wallet, external);
}));

test("a late close never ends the connection that came after it", () => harness(async h => {
  const first = h.connect();
  await h.render({ isOpen: true });
  h.renderNow({ isOpen: false });
  h.privy.callbacks.onSuccess({ wallet: external });
  const second = h.connect();
  await h.tick();
  assert.equal(first.wallet, external);
  assert.equal(second.settled, false);
}));

test("a close from before a connection does not end it", () => harness(async h => {
  await h.render({ isOpen: true }); await h.render({ isOpen: false });
  const result = h.connect(); await h.tick();
  assert.equal(result.settled, false);
}));

test("only one connection at a time; a logout and an unmount end it", () => harness(async h => {
  const first = h.connect(), refused = h.connect(); await h.tick();
  assert.match(refused.error.message, /unavailable/);
  await h.render({ authenticated: false }); await h.tick();
  assert.match(first.error.message, /closed/);
  await h.render({ authenticated: true });
  const last = h.connect();
  await h.unmount(); await h.tick();
  assert.match(last.error.message, /closed/);
}));

for (const wallet of [{ ...external, walletClientType: "privy" }, { ...external, type: "solana" }]) {
  test(`the ${wallet.walletClientType} ${wallet.type} wallet cannot fund the purchase`, () => harness(async h => {
    const result = h.connect();
    h.privy.callbacks.onSuccess({ wallet }); await h.tick();
    assert.match(result.error.message, /External Ethereum wallet required/);
  }));
}
