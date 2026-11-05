import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ethereum, robinhoodChain } from "../src/chains.js";
import { CONSUMER_LOGIN_METHODS, CONSUMER_SIGN_IN, LEGAL_URLS, consumerProfile, createPrivyConfig } from "../src/privy/config.js";

const stocks = () => createPrivyConfig({ brand: { accentColor: "#3B38D0" }, defaultChain: robinhoodChain, extraChains: [ethereum] });

test("login methods are identical to Gold's, so a Google user of ouro. finds Google here", () => {
  const config = stocks();
  assert.deepEqual(config.loginMethodsAndOrder, { primary: ["google"], overflow: ["email"] });
  assert.deepEqual(JSON.parse(JSON.stringify(CONSUMER_LOGIN_METHODS)), config.loginMethodsAndOrder);
  // Gold's PrivyShell is not migrated yet: pin the two configs against each other.
  const goldShell = readFileSync(new URL("../../../apps/gold/src/PrivyShell.jsx", import.meta.url), "utf8");
  assert.match(goldShell, /loginMethodsAndOrder: \{ primary: \["google"\], overflow: \["email"\] \}/);
  assert.match(goldShell, /createOnLogin: "users-without-wallets"/);
});

test("every user gets an embedded wallet on login", () => {
  assert.deepEqual(stocks().embeddedWallets, { ethereum: { createOnLogin: "users-without-wallets" } });
});

test("the sign-in is branded 'Entrar com Vortex', never as an account", () => {
  const config = createPrivyConfig({ brand: { accentColor: "#3B38D0", logoUrl: "/pt-br/stocks/brand/vortex.svg", loginMessage: "O mesmo acesso do ouro." }, defaultChain: robinhoodChain });
  assert.equal(CONSUMER_SIGN_IN.button, "Entrar com Vortex");
  assert.equal(CONSUMER_SIGN_IN.noun, "ID Vortex");
  assert.equal(CONSUMER_SIGN_IN.helper, "o mesmo acesso do ouro.");
  assert.deepEqual(config.appearance, { theme: "light", accentColor: "#3B38D0", landingHeader: "Entrar com Vortex", logo: "/pt-br/stocks/brand/vortex.svg", loginMessage: "O mesmo acesso do ouro." });
  assert.ok(!/conta vortex/i.test(JSON.stringify({ CONSUMER_SIGN_IN, config })));
  assert.equal("logo" in stocks().appearance, false);
});

test("the default chain comes first, chains are unique and only the listed chain gets an RPC override", () => {
  const url = "https://rpc.example.test/fake-test-only";
  const config = createPrivyConfig({ brand: { accentColor: "#3B38D0" }, defaultChain: robinhoodChain, extraChains: [ethereum, robinhoodChain], rpcOverrides: { 4663: url } });
  assert.equal(config.defaultChain.id, config.supportedChains[0].id);
  assert.deepEqual(config.supportedChains.map((chain) => chain.id), [4663, 1]);
  assert.equal(config.defaultChain.rpcUrls.privyWalletOverride.http[0], url);
  assert.equal(config.supportedChains[1].rpcUrls.privyWalletOverride, undefined);
  assert.equal(stocks().defaultChain.rpcUrls.privyWalletOverride, undefined);
});

test("the accent colour must be a #RRGGBB hex and a default chain is required", () => {
  for (const accentColor of ["3B38D0", "#3B38D", "#3B38D0FF", "blue", undefined]) assert.throws(() => createPrivyConfig({ brand: { accentColor }, defaultChain: robinhoodChain }), /accentColor/);
  assert.throws(() => createPrivyConfig({ brand: { accentColor: "#1F513F" } }), /defaultChain/);
});

test("the legal links point at the Brazilian Vortex pages", () => {
  assert.deepEqual(stocks().legal, LEGAL_URLS);
  for (const url of Object.values(LEGAL_URLS)) assert.match(url, /^https:\/\/www\.vortexfinance\.co\/pt-br\//);
});

test("an e-mail login has no name: never the e-mail's local part as a first name", () => {
  assert.deepEqual(consumerProfile({ email: { address: "joao.silva82@example.com" } }), { name: "", firstName: "", email: "joao.silva82@example.com" });
  assert.deepEqual(consumerProfile({ google: { name: "Ana Maria Silva", email: "ana@example.com" } }), { name: "Ana Maria Silva", firstName: "Ana", email: "ana@example.com" });
  assert.deepEqual(consumerProfile({ google: { name: "  ", email: "ana@example.com" } }), { name: "", firstName: "", email: "ana@example.com" });
  assert.deepEqual(consumerProfile(null), { name: "", firstName: "", email: "" });
  const provider = readFileSync(new URL("../src/privy/ConsumerPrivyProvider.jsx", import.meta.url), "utf8");
  assert.match(provider, /consumerProfile\(user\)/, "the provider builds the user from consumerProfile");
  assert.doesNotMatch(provider, /split\("@"\)/);
});
