import assert from "node:assert/strict";
import test from "node:test";
import { encodeFunctionData, parseAbi } from "viem";
import { StocksRampError } from "../src/lib/ramp-contract.js";
import { STOCK_TOKENS } from "../src/lib/stocks.js";
import { gasShortfallPt } from "../src/lib/gas-reserve.js";
import { buildStockBuyRequest, buildStockSellRequest, createVortexStocksAdapter, mapAvailability, mapStocksError, normalizeStockQuote, validateStockQuote } from "../src/lib/vortex-stocks.js";
import { NOW, NVDA, ROUTER, TX_HASH, approveTx, fakeSdk, fakeSession, fakeWallet, stores, vortexQuote } from "./fake-vortex.mjs";
import { WALLET, forbiddenFetch, json, sourceFiles, withFetch } from "./helpers.mjs";

const API = "https://www.vortexfinance.co/api/production";
const code = (expected) => (error) => error instanceof StocksRampError && error.code === expected;

const TEST_SELL_POLICY = { spenders: [ROUTER], phases: { squidRouterApprove: ["approve"], lifiApprove: ["approve"], squidRouterNoPermitTransfer: ["transfer"] } };
function adapter({ enabled = true, sdk = fakeSdk(), session = fakeSession(), kyc, readBalance, log = [], now = () => NOW, sellSigningPolicy = TEST_SELL_POLICY, readMaintenance = async () => ({ active: false, details: null }) } = {}) {
  const recovery = stores(log);
  const instance = createVortexStocksAdapter({
    enabled, network: "robinhood", apiBase: API, session, activeRampStore: recovery.activeRampStore, ephemeralStore: recovery.ephemeralStore,
    kyc: kyc ?? { getReadiness: async () => ({ kycStatus: "approved", canBuy: true, canSell: true }) },
    createClient: sdk.createClient, readBalance, now, sellSigningPolicy, readMaintenance, warn: () => {},
  });
  return { adapter: instance, sdk, ...recovery };
}

test("production sells remain disabled without an independently reviewed signing policy", async () => {
  const s = adapter({ sellSigningPolicy: null });
  const quote = await s.adapter.quoteSell({ symbol: "NVDA", tokenAmount: "0.5" });
  await assert.rejects(s.adapter.registerSell({ quote, walletAddress: WALLET, wallet: fakeWallet() }), code("SELL_NOT_ENABLED"));
  assert.equal(s.sdk.calls.registerRamp.length, 0);
});

test("maintenance stops new Pix registration and ramp start without discarding recovery", async () => {
  let active = true;
  const s = adapter({ readMaintenance: async () => ({ active, details: null }) });
  const quote = await s.adapter.quoteBuy({ symbol: "NVDA", brlAmount: 500 });
  await assert.rejects(s.adapter.registerBuy({ quote, walletAddress: WALLET }), code("MAINTENANCE_ACTIVE"));
  assert.equal(s.sdk.calls.registerRamp.length, 0);
  active = false;
  const ramp = await s.adapter.registerBuy({ quote, walletAddress: WALLET });
  active = true;
  await assert.rejects(s.adapter.startRamp(ramp.id), code("MAINTENANCE_ACTIVE"));
  assert.equal(s.sdk.calls.startRamp.length, 0);
  assert.equal(s.activeRampStore.get(WALLET).rampId, ramp.id);
});

test("maintenance opening after sell registration stops the wallet immediately before broadcast", async () => {
  let checks = 0;
  const s = adapter({ sdk: fakeSdk({ unsignedTransactions: [approveTx({ signer: WALLET, amountWei: 5n * 10n ** 17n })] }), readBalance: async () => 10n ** 18n,
    readMaintenance: async () => ({ active: ++checks > 1, details: null }) });
  const quote = await s.adapter.quoteSell({ symbol: "NVDA", tokenAmount: "0.5" }), log = [];
  await assert.rejects(s.adapter.registerSell({ quote, walletAddress: WALLET, wallet: fakeWallet(log) }), code("MAINTENANCE_ACTIVE"));
  assert.equal(log.includes("eth_sendTransaction"), false);
  assert.equal(checks, 2);
  assert.equal(s.activeRampStore.get(WALLET).stage, "signing");
  assert.deepEqual(s.activeRampStore.get(WALLET).transactions, {});
});

test("fee totals reconcile even without optional reserve/provider extensions", () => {
  const request = buildStockBuyRequest({ network: "robinhood", outputId: NVDA, brlAmount: 500 });
  for (const fields of [{ networkFeeFiat: "100", processingFeeFiat: "100", totalFeeFiat: "1" }, { networkFeeFiat: "300", processingFeeFiat: "300", totalFeeFiat: "600" }, { networkFeeFiat: " " }, { totalFeeFiat: false }]) {
    assert.throws(() => validateStockQuote(vortexQuote(request, fields), { direction: "BUY", network: "robinhood", id: NVDA, requested: 500, now: NOW }), code("INVALID_FEES"));
  }
});

test("a delayed initial sell registration cannot broadcast after its start window", async () => {
  let time = NOW;
  const sdk = fakeSdk({ unsignedTransactions: [approveTx({ signer: WALLET, amountWei: 5n * 10n ** 17n })] });
  const original = sdk.createClient;
  sdk.createClient = async (config) => {
    const client = await original(config), register = client.registerRamp.bind(client);
    return { ...client, registerRamp: async (...args) => { const result = await register(...args); time += 16 * 60_000; return result; } };
  };
  const s = adapter({ sdk, now: () => time, readBalance: async () => 10n ** 18n });
  const quote = await s.adapter.quoteSell({ symbol: "NVDA", tokenAmount: "0.5" });
  const log = [];
  await assert.rejects(s.adapter.registerSell({ quote, walletAddress: WALLET, wallet: fakeWallet(log), pixKey: "test@example.com" }), code("SELL_EXPIRED"));
  assert.equal(log.includes("eth_sendTransaction"), false);
});

test("another wallet's pending Pix record blocks registration without revealing or replacing it", async () => {
  const s = adapter();
  const other = "0x0000000000000000000000000000000000000001";
  s.activeRampStore.save({ rampId: "paid-A", walletAddress: other }); s.activeRampStore.checkpoint("paid-A", "transfer", TX_HASH);
  const quote = await s.adapter.quoteBuy({ symbol: "NVDA", brlAmount: 500 });
  await assert.rejects(s.adapter.registerBuy({ quote, walletAddress: WALLET }), code("RAMP_IN_PROGRESS"));
  assert.equal(s.sdk.calls.registerRamp.length, 0); assert.equal(s.activeRampStore.get(other).transactions.transfer, TX_HASH);
});

test("two concurrent buy submissions reserve only one recovery record and register once", async () => {
  const s = adapter(), quote = await s.adapter.quoteBuy({ symbol: "NVDA", brlAmount: 500 });
  const results = await Promise.allSettled([s.adapter.registerBuy({ quote, walletAddress: WALLET }), s.adapter.registerBuy({ quote, walletAddress: WALLET })]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(s.sdk.calls.registerRamp.length, 1);
  assert.equal(s.activeRampStore.get(WALLET).rampId, "ramp-fake-1");
});

test("request builders use network \"robinhood\" and the token address (or symbol)", () => {
  assert.deepEqual(buildStockBuyRequest({ network: "robinhood", outputId: NVDA, brlAmount: 500 }), {
    rampType: "BUY", from: "pix", to: "robinhood", inputAmount: "500", inputCurrency: "BRL", outputCurrency: NVDA, paymentMethod: "pix", countryCode: "BR", network: "robinhood",
  });
  assert.deepEqual(buildStockSellRequest({ network: "robinhood", inputId: "NVDA", tokenAmount: "0.5" }), {
    rampType: "SELL", from: "robinhood", to: "pix", inputAmount: "0.5", inputCurrency: "NVDA", outputCurrency: "BRL", paymentMethod: "pix", countryCode: "BR", network: "robinhood",
  });
});

test("the adapter identifies the token by its allowlisted address, never by its symbol", async () => {
  const { adapter: live, sdk } = adapter();
  await live.quoteBuy({ symbol: "NVDA", brlAmount: 500, walletAddress: WALLET });
  assert.equal(sdk.calls.createQuote[0].outputCurrency, NVDA);
  await live.quoteSell({ symbol: "nvda", tokenAmount: "0,5", walletAddress: WALLET });
  assert.deepEqual(sdk.calls.createQuote[1], buildStockSellRequest({ network: "robinhood", inputId: NVDA, tokenAmount: "0.5" }));
  // A quote naming the symbol (as a lookalike could) instead of the address is refused.
  const bySymbol = adapter({ sdk: fakeSdk({ quote: (request) => vortexQuote(request, { outputCurrency: "NVDA" }) }) });
  await assert.rejects(bySymbol.adapter.quoteBuy({ symbol: "NVDA", brlAmount: 500, walletAddress: WALLET }), code("WRONG_ROUTE"));
});

test("quote validation fails closed", () => {
  const buyRequest = buildStockBuyRequest({ network: "robinhood", outputId: NVDA, brlAmount: 500 });
  const sellRequest = buildStockSellRequest({ network: "robinhood", inputId: NVDA, tokenAmount: "0.5" });
  const buy = (overrides) => () => validateStockQuote(vortexQuote(buyRequest, overrides), { direction: "BUY", network: "robinhood", id: NVDA, requested: 500, now: NOW });
  const sell = (overrides) => () => validateStockQuote(vortexQuote(sellRequest, overrides), { direction: "SELL", network: "robinhood", id: NVDA, requested: "0.5", now: NOW });
  assert.doesNotThrow(buy({}));
  assert.doesNotThrow(buy({ outputCurrency: NVDA.toLowerCase() }), "the id compares case-insensitively");
  assert.doesNotThrow(sell({}));
  assert.throws(buy({ network: "ethereum" }), code("WRONG_ROUTE"));
  assert.throws(buy({ to: "ethereum" }), code("WRONG_ROUTE"));
  assert.throws(buy({ from: "sepa" }), code("WRONG_ROUTE"));
  assert.throws(buy({ rampType: "SELL" }), code("WRONG_ROUTE"));
  assert.throws(buy({ inputCurrency: "USD" }), code("WRONG_ROUTE"));
  assert.throws(buy({ outputCurrency: "0x0000000000000000000000000000000000000001" }), code("WRONG_ROUTE"), "a different token");
  assert.throws(sell({ from: "base" }), code("WRONG_ROUTE"));
  assert.throws(sell({ outputCurrency: "USDC" }), code("WRONG_ROUTE"));
  assert.throws(buy({ id: "" }), code("INVALID_QUOTE"));
  assert.throws(buy({ expiresAt: new Date(NOW - 1).toISOString() }), code("INVALID_QUOTE"), "expired");
  assert.throws(buy({ expiresAt: "soon" }), code("INVALID_QUOTE"));
  assert.throws(buy({ outputAmount: "NaN" }), code("INVALID_QUOTE"));
  assert.throws(buy({ outputAmount: "0" }), code("INVALID_QUOTE"));
  assert.throws(buy({ outputAmount: "0.4260000000000000001" }), code("INVALID_QUOTE"), "more than 18 decimals");
  assert.throws(buy({ totalFeeFiat: undefined }), code("INVALID_FEES"));
  assert.throws(buy({ partnerFeeFiat: "-1" }), code("INVALID_FEES"));
  assert.throws(buy({ partnerFeeFiat: "0.01" }), code("INVALID_FEES"), "Stocks must never add a product/partner markup");
  assert.throws(buy({ routingStrategy: undefined }), code("WRONG_ROUTE"), "direct execution must be confirmed by the backend");
  assert.throws(buy({ routingStrategy: "lifi" }), code("WRONG_ROUTE"), "no silent LI.FI fallback");
  assert.throws(sell({ routingStrategy: "lifi" }), code("WRONG_ROUTE"));
  assert.throws(sell({ partnerFeeFiat: "0.01" }), code("INVALID_FEES"));
  assert.throws(buy({ feeCurrency: "USD" }), code("INVALID_FEES"));
  assert.throws(buy({ inputAmount: "5000" }), code("AMOUNT_MISMATCH"), "BUY inputAmount must be what the user typed");
  assert.throws(sell({ inputAmount: "0.6" }), code("AMOUNT_MISMATCH"), "a SELL must never sell more than requested");
  assert.throws(sell({ inputAmount: "0.5000000000000000001" }), code("INVALID_QUOTE"));
  assert.throws(buy({ providerCosts: [{ id: "bridge", provider: "lifi", amountFiat: "0.50", includedIn: "rate" }] }), code("INVALID_FEES"));
});

test("a normalised quote carries fees, the implied price net of fees and the raw quote", () => {
  const token = STOCK_TOKENS.find((item) => item.symbol === "NVDA");
  const buy = normalizeStockQuote(vortexQuote(buildStockBuyRequest({ network: "robinhood", outputId: NVDA, brlAmount: 500 })), token, "BUY");
  assert.equal(buy.brlAmount, 500);
  assert.equal(buy.tokenAmount, "0.426");
  assert.equal(buy.tokenAmountWei, "426000000000000000");
  assert.deepEqual(buy.fees, { network: 0.3, service: 3.75, total: 4.05, currency: "BRL" });
  assert.ok(Math.abs(buy.impliedBrlPerToken - (500 - 4.05) / 0.426) < 1e-9);
  assert.equal(buy.expiresAt, NOW + 60_000);
  assert.equal(buy.gasless, false);
  assert.equal(buy.gasReserve, null, "no reserve fields, no reserve (today's API)");
  assert.equal(buy.simulated, false);
  assert.equal(buy.rawQuote.id, "quote-fake-test-only");
  const sell = normalizeStockQuote(vortexQuote(buildStockSellRequest({ network: "robinhood", inputId: NVDA, tokenAmount: "1" }), { gasless: true }), token, "SELL");
  assert.equal(sell.brlAmount, 1158.1);
  assert.ok(Math.abs(sell.impliedBrlPerToken - (1158.1 + 4.05)) < 1e-9);
  assert.equal(sell.gasless, true);
});

test("availability needs the canonical address, 18 decimals and the ramp direction", () => {
  const listed = (overrides) => ({ assetSymbol: "NVDA", assetNetwork: "robinhood", assetContractAddress: NVDA.toLowerCase(), assetDecimals: 18, rampTypes: ["BUY", "SELL"], ...overrides });
  const map = mapAvailability([listed(), listed({ assetSymbol: "SPY", assetContractAddress: STOCK_TOKENS[0].address, rampTypes: ["BUY"] })], { network: "robinhood" });
  assert.deepEqual(map.NVDA, { buy: true, sell: true, reason: null });
  assert.deepEqual(map.SPY, { buy: true, sell: false, reason: null });
  assert.deepEqual(map.AAPL, { buy: false, sell: false, reason: "token_not_listed" });
  const warnings = [];
  const lookalike = mapAvailability({ tokens: [listed({ assetContractAddress: "0xCA9c78Dd337A67F6e0077F65F5E9218719d30eDf" })] }, { network: "robinhood", warn: (message) => warnings.push(message) });
  assert.equal(lookalike.NVDA.reason, "address_mismatch");
  assert.equal(warnings.length, 1);
  assert.equal(mapAvailability([listed({ assetDecimals: 6 })], { network: "robinhood" }).NVDA.reason, "address_mismatch");
  assert.equal(mapAvailability([listed({ assetNetwork: "ethereum" })], { network: "robinhood" }).NVDA.reason, "token_not_listed");
  assert.equal(mapAvailability([listed({ rampTypes: [] })], { network: "robinhood" }).NVDA.reason, "token_not_listed");
});

test("the gated adapter makes no network call and refuses every ramp action", async () => {
  const fetches = [];
  const { adapter: gated, sdk } = adapter({ enabled: false });
  assert.equal(gated.enabled, false);
  await withFetch(forbiddenFetch(fetches), async () => {
    const availability = await gated.getAvailability();
    assert.equal(Object.keys(availability).length, 12);
    for (const entry of Object.values(availability)) assert.deepEqual(entry, { buy: false, sell: false, reason: "not_enabled" });
    await assert.rejects(gated.getReadiness(), code("STOCKS_RAMP_NOT_ENABLED"));
    await assert.rejects(gated.quoteBuy({ symbol: "NVDA", brlAmount: 500, walletAddress: WALLET }), code("STOCKS_RAMP_NOT_ENABLED"));
    await assert.rejects(gated.quoteSell({ symbol: "NVDA", tokenAmount: "1", walletAddress: WALLET }), code("STOCKS_RAMP_NOT_ENABLED"));
    await assert.rejects(gated.registerBuy({ quote: {}, walletAddress: WALLET }), code("STOCKS_RAMP_NOT_ENABLED"));
    await assert.rejects(gated.registerSell({ quote: {}, walletAddress: WALLET, pixKey: "x", wallet: fakeWallet() }), code("STOCKS_RAMP_NOT_ENABLED"));
    await assert.rejects(gated.resumeSell({ rampId: "r", walletAddress: WALLET, wallet: fakeWallet() }), code("STOCKS_RAMP_NOT_ENABLED"));
    await assert.rejects(gated.startRamp("r"), code("STOCKS_RAMP_NOT_ENABLED"));
  });
  assert.equal(fetches.length, 0);
  assert.equal(sdk.calls.created, 0, "the 3.5 MB SDK is not even loaded");
  assert.match(new StocksRampError("STOCKS_RAMP_NOT_ENABLED").message, /ainda não estão disponíveis pela Vortex/);
});

test("a ramp registered while enabled can still be tracked while gated", async () => {
  const { adapter: gated, sdk } = adapter({ enabled: false });
  const ramp = await gated.getRamp("ramp-old");
  assert.equal(ramp.classification, "success");
  assert.equal(sdk.calls.getRampStatus.length, 1);
});

test("both live \"unknown network\" answers become network_not_supported", async () => {
  const bodies = [
    { error: "Invalid network: 'robinhood'. Supported networks are: 'assethub', 'paseo', 'arbitrum', 'avalanche', 'base', 'bsc', 'ethereum', 'polygon', 'moonbeam', 'polygonAmoy', 'base-sepolia'" },
    { code: 400, message: "Unable to determine network from to destination" },
  ];
  for (const body of bodies) {
    const requested = [];
    const { adapter: live } = adapter();
    const availability = await withFetch(async (url) => { requested.push(String(url)); return json(body, 400); }, () => live.getAvailability());
    assert.equal(requested[0], `${API}/v1/supported-cryptocurrencies?network=robinhood`);
    for (const entry of Object.values(availability)) assert.equal(entry.reason, "network_not_supported");
  }
  // The same answer to a quote (the SDK throws with the API message and status).
  const sdk = fakeSdk({ quote: () => { throw Object.assign(new Error("Unable to determine network from to destination"), { status: 400 }); } });
  await assert.rejects(adapter({ sdk }).adapter.quoteBuy({ symbol: "NVDA", brlAmount: 500 }), code("NETWORK_NOT_SUPPORTED"));
});

test("availability is cached for 60 s; other errors are not cached and show \"error\"", async () => {
  const { adapter: live } = adapter();
  let calls = 0;
  let fail = true;
  const fetchImpl = async () => { calls += 1; return fail ? json({ error: "boom" }, 503) : json([]); };
  await withFetch(fetchImpl, async () => {
    assert.equal((await live.getAvailability()).NVDA.reason, "error");
    fail = false;
    assert.equal((await live.getAvailability()).NVDA.reason, "token_not_listed");
    await live.getAvailability();
    assert.equal(calls, 2);
    await live.getAvailability({ force: true });
    assert.equal(calls, 3);
  });
});

test("a 401 anywhere means the e-mail code again (AUTH_REQUIRED)", async () => {
  const unauthorized = Object.assign(new Error("Sua sessão de segurança expirou."), { status: 401 });
  const sdk = fakeSdk({ quote: () => { throw unauthorized; } });
  await assert.rejects(adapter({ sdk }).adapter.quoteBuy({ symbol: "NVDA", brlAmount: 500 }), code("AUTH_REQUIRED"));
  const kyc = { getReadiness: async () => { throw unauthorized; } };
  await assert.rejects(adapter({ kyc }).adapter.getReadiness(), (error) => error.code === "AUTH_REQUIRED" && error.status === 401);
});

test("only allowlisted tokens are quoted, before any request", async () => {
  const { adapter: live, sdk } = adapter();
  await assert.rejects(live.quoteBuy({ symbol: "NU", brlAmount: 500 }), code("TOKEN_NOT_ALLOWED"));
  await assert.rejects(live.quoteBuy({ symbol: "GLD", brlAmount: 500 }), code("TOKEN_NOT_ALLOWED"));
  await assert.rejects(live.quoteSell({ symbol: "NVDA", tokenAmount: "1,0000000000000000001" }), code("INVALID_QUOTE"));
  await assert.rejects(live.quoteSell({ symbol: "NVDA", tokenAmount: "0" }), code("INVALID_QUOTE"));
  assert.equal(sdk.calls.createQuote.length, 0);
});

test("a buy stores the active ramp as \"registering\" BEFORE its ephemeral keys, then \"registered\"", async () => {
  const log = [];
  const { adapter: live, sdk, activeRampStore } = adapter({ log, sdk: fakeSdk({ log }) });
  const quote = await live.quoteBuy({ symbol: "NVDA", brlAmount: 500, walletAddress: WALLET });
  const ramp = await live.registerBuy({ quote, walletAddress: WALLET });
  assert.deepEqual(log, ["before-ephemerals", "put:ramp-fake-1:registering"]);
  assert.deepEqual(sdk.calls.registerRamp[0].data, { destinationAddress: WALLET });
  assert.equal(sdk.calls.registerRamp[0].raw, quote.rawQuote);
  const record = activeRampStore.get(WALLET);
  assert.equal(record.stage, "registered");
  assert.equal(record.symbol, "NVDA");
  assert.equal(record.tokenAddress, NVDA);
  assert.equal(record.inputAmount, "500");
  assert.equal(ramp.classification, "awaiting_payment");
  assert.equal(ramp.depositQrCode, "pix-code-fake-test-only");
  assert.equal(ramp.symbol, "NVDA");
  await assert.rejects(live.registerBuy({ quote, walletAddress: "" }), code("WALLET_NOT_READY"));
  await assert.rejects(live.registerBuy({ quote: { ...quote, simulated: true }, walletAddress: WALLET }), code("INVALID_QUOTE"), "a simulated quote never reaches Vortex");
});

test("a failed recovery write stops the registration (fail closed)", async () => {
  const sdk = fakeSdk();
  const recovery = stores();
  const live = createVortexStocksAdapter({
    enabled: true, apiBase: API, session: fakeSession(), kyc: {}, createClient: sdk.createClient, now: () => NOW,
    readMaintenance: async () => ({ active: false, details: null }),
    activeRampStore: { ...recovery.activeRampStore, save: () => { throw new Error("Não foi possível salvar a operação. Pare e contate o suporte."); } },
    ephemeralStore: recovery.ephemeralStore,
  });
  const quote = await live.quoteBuy({ symbol: "NVDA", brlAmount: 500 });
  await assert.rejects(live.registerBuy({ quote, walletAddress: WALLET }), /Não foi possível salvar a operação/);
});

test("a sell checks the balance, signs on Robinhood Chain with checkpoints and ends \"ready\"", async () => {
  const walletLog = [];
  const tx = approveTx({ signer: WALLET, amountWei: 5n * 10n ** 17n, phase: "lifiApprove" });
  const other = { phase: "lifiSwap", signer: "0x0000000000000000000000000000000000000001", txData: { to: ROUTER, data: "0x" } };
  const sdk = fakeSdk({ unsignedTransactions: [tx, other] });
  const { adapter: live, activeRampStore } = adapter({ sdk, readBalance: async () => 10n ** 18n });
  const quote = await live.quoteSell({ symbol: "NVDA", tokenAmount: "0,5", walletAddress: WALLET });
  const registered = [];
  const ramp = await live.registerSell({ quote, walletAddress: WALLET, pixKey: "  fake-test-only@example.com ", wallet: fakeWallet(walletLog), onRegistered: (r) => registered.push(r.id) });
  assert.deepEqual(sdk.calls.registerRamp[0].data, { walletAddress: WALLET, pixDestination: "fake-test-only@example.com" });
  assert.deepEqual(registered, ["ramp-fake-1"]);
  assert.equal(walletLog[0], "wallet_switchEthereumChain:0x1237");
  assert.deepEqual(sdk.calls.submitUserTransactions[0].transactions, [tx], "only the user's own transactions");
  assert.equal(walletLog.filter((entry) => entry === "eth_sendTransaction").length, 1);
  const record = activeRampStore.get(WALLET);
  assert.equal(record.stage, "ready");
  assert.equal(record.transactions.lifiApprove, TX_HASH);
  assert.equal(record.rampType, "SELL");
  assert.equal(ramp.direction, "SELL");
  assert.equal(ramp.symbol, "NVDA");
});

test("a sell above the on-chain balance is refused before registering", async () => {
  const sdk = fakeSdk();
  const { adapter: live } = adapter({ sdk, readBalance: async () => 10n ** 17n });
  const quote = await live.quoteSell({ symbol: "NVDA", tokenAmount: "0.5" });
  await assert.rejects(live.registerSell({ quote, walletAddress: WALLET, pixKey: "k", wallet: fakeWallet() }), code("INSUFFICIENT_BALANCE"));
  assert.equal(sdk.calls.registerRamp.length, 0);
  await assert.rejects(live.registerSell({ quote, walletAddress: WALLET, pixKey: "k", wallet: {} }), code("WALLET_NOT_READY"));
});

test("resuming a sell never broadcasts a checkpointed transaction again", async () => {
  const walletLog = [];
  const tx = approveTx({ signer: WALLET, amountWei: 5n * 10n ** 17n, phase: "lifiApprove" });
  const rampBody = { id: "ramp-fake-1", type: "SELL", currentPhase: "initial", status: "PENDING", inputCurrency: NVDA, inputAmount: "0.5", outputCurrency: "BRL", outputAmount: "570", createdAt: new Date(NOW).toISOString(), unsignedTxs: [tx] };
  const session = fakeSession({ "/v1/ramp/ramp-fake-1": rampBody });
  const { adapter: live, activeRampStore } = adapter({ session });
  activeRampStore.save({ rampId: "ramp-fake-1", walletAddress: WALLET, rampType: "SELL", stage: "signing", symbol: "NVDA", tokenAddress: NVDA, inputAmount: "0.5" });
  activeRampStore.checkpoint("ramp-fake-1", "lifiApprove", TX_HASH);
  const ramp = await live.resumeSell({ rampId: "ramp-fake-1", walletAddress: WALLET, wallet: fakeWallet(walletLog) });
  assert.equal(session.calls[0], "/v1/ramp/ramp-fake-1?showUnsignedTxs=true");
  assert.ok(!walletLog.includes("eth_sendTransaction"), "the saved hash is only awaited");
  assert.ok(walletLog.includes("receipt"));
  assert.equal(activeRampStore.get(WALLET).stage, "ready");
  assert.equal(ramp.symbol, "NVDA");
  // Already "ready": nothing is signed again.
  walletLog.length = 0;
  await live.resumeSell({ rampId: "ramp-fake-1", walletAddress: WALLET, wallet: fakeWallet(walletLog) });
  assert.deepEqual(walletLog, []);
});

// The API refuses startRamp 15 minutes after registration (RAMP_START_EXPIRATION_TIME_SECONDS). A
// resume after that must not move the tokens for a sell that can never start.
// phases: the user's transactions; sent: those already broadcast (checkpointed) before the tab closed.
// minutesAgo: registration by the server's createdAt; localMinutesAgo: by this device's own record.
function staleSell({ minutesAgo, localMinutesAgo = minutesAgo, phases = ["lifiApprove"], sent = [], walletLog = [] }) {
  const txs = phases.map((phase) => approveTx({ signer: WALLET, amountWei: 5n * 10n ** 17n, phase }));
  const rampBody = { id: "ramp-old", type: "SELL", currentPhase: "initial", status: "PENDING", inputCurrency: NVDA, inputAmount: "0.5", outputCurrency: "BRL", outputAmount: "570", createdAt: new Date(NOW - minutesAgo * 60_000).toISOString(), unsignedTxs: txs };
  const setup = adapter({ session: fakeSession({ "/v1/ramp/ramp-old": rampBody }) });
  setup.activeRampStore.save({ rampId: "ramp-old", walletAddress: WALLET, rampType: "SELL", stage: "signing", symbol: "NVDA", tokenAddress: NVDA, inputAmount: "0.5", createdAt: NOW - localMinutesAgo * 60_000 });
  for (const phase of sent) setup.activeRampStore.checkpoint("ramp-old", phase, TX_HASH);
  return { ...setup, resume: () => setup.adapter.resumeSell({ rampId: "ramp-old", walletAddress: WALLET, wallet: fakeWallet(walletLog) }) };
}

test("a resumed sell past its start window signs nothing, is settled and asks for a new sell", async () => {
  const walletLog = [];
  const { adapter: live, activeRampStore, resume } = staleSell({ minutesAgo: 16, walletLog });
  await assert.rejects(resume(), (error) => error.code === "SELL_EXPIRED" && error.details.rampId === "ramp-old" && error.details.broadcast === false
    && /nada saiu da sua carteira\. Comece uma nova venda\./.test(error.message));
  assert.deepEqual(walletLog, [], "no chain switch, no signature, no broadcast");
  assert.equal(activeRampStore.get(WALLET), null, "the stale sell no longer holds this device (abandoned-ramp rule)");
  const buy = await live.quoteBuy({ symbol: "NVDA", brlAmount: 500, walletAddress: WALLET });
  await live.registerBuy({ quote: buy, walletAddress: WALLET });
  assert.equal(activeRampStore.get(WALLET).rampType, "BUY");
});

test("the start deadline keeps a minute's margin; a transaction already sent means support", async () => {
  const within = staleSell({ minutesAgo: 14.5 });
  await assert.rejects(within.resume(), (error) => error.code === "SELL_EXPIRED", "30 s left: a wallet confirmation may not make it");
  const walletLog = [];
  const inTime = staleSell({ minutesAgo: 13, walletLog });
  assert.equal((await inTime.resume()).id, "ramp-old");
  assert.ok(walletLog.includes("eth_sendTransaction"), "two minutes left: signed as before");
  assert.equal(inTime.activeRampStore.get(WALLET).stage, "ready");
  const sentLog = [];
  const sent = staleSell({ minutesAgo: 20, phases: ["lifiApprove", "lifiSwap"], sent: ["lifiApprove"], walletLog: sentLog });
  await assert.rejects(sent.resume(), (error) => error.code === "SELL_EXPIRED" && error.details.broadcast === true && /Consulte o suporte com o código da operação/.test(error.message) && !/nova venda/.test(error.message));
  assert.deepEqual(sentLog, [], "the rest is not signed, not even the receipt waited for");
  assert.equal(sent.activeRampStore.get(WALLET).rampId, "ramp-old", "a broadcast sell retains its support/recovery record");
});

test("a known broadcast survives age-based abandonment until settlement is confirmed", async () => {
  const s = staleSell({ minutesAgo: 61, phases: ["squidRouterNoPermitTransfer"], sent: ["squidRouterNoPermitTransfer"] });
  assert.equal((await s.resume()).classification, "failure");
  assert.equal(s.activeRampStore.get(WALLET).transactions.squidRouterNoPermitTransfer, TX_HASH);
  assert.equal(s.activeRampStore.hasActive(), true);
  const unsigned = staleSell({ minutesAgo: 61 });
  await unsigned.resume(); assert.equal(unsigned.activeRampStore.get(WALLET), null);
});

test("a rejected wallet request's null checkpoint is not a broadcast at the start deadline", async () => {
  const s = staleSell({ minutesAgo: 20 });
  s.activeRampStore.checkpoint("ramp-old", "lifiApprove", null);
  await assert.rejects(s.resume(), error => error.code === "SELL_EXPIRED" && error.details.broadcast === false);
  assert.equal(s.activeRampStore.get(WALLET), null);
});

test("the start window also counts on this device's own clock, so a clock running behind never signs late", async () => {
  // Registered 16 minutes ago. This device's clock runs 6 minutes behind the server's, so the server's
  // createdAt reads only 10 minutes ago here; the device's own record (createdAt, taken just before
  // registerRamp, on its own clock) still says 16. The earlier deadline counts: nothing is signed.
  const walletLog = [];
  const behind = staleSell({ minutesAgo: 10, localMinutesAgo: 16, walletLog });
  await assert.rejects(behind.resume(), (error) => error.code === "SELL_EXPIRED" && error.details.broadcast === false);
  assert.deepEqual(walletLog, [], "no signature, no broadcast");
  assert.equal(behind.activeRampStore.get(WALLET), null);
  // A record without a usable createdAt (stored as null) leaves the server's deadline alone to decide.
  const inTime = staleSell({ minutesAgo: 10, localMinutesAgo: Number.NaN });
  assert.equal(inTime.activeRampStore.get(WALLET).createdAt, null);
  assert.equal((await inTime.resume()).id, "ramp-old");
});

test("a resumed sell whose transactions were all sent is finished near or past its deadline, never re-signed", async () => {
  // Broadcast and checkpointed, then the tab closed before "ready": nothing is left to sign, so the
  // start window guards nothing here. Refusing it would leave tokens that already moved to support,
  // although 30 s before the deadline the start still succeeds; past it, the API decides.
  for (const minutesAgo of [14.5, 20]) {
    const walletLog = [];
    const done = staleSell({ minutesAgo, sent: ["lifiApprove"], walletLog });
    assert.equal((await done.resume()).id, "ramp-old", `${minutesAgo} min`);
    assert.ok(!walletLog.includes("eth_sendTransaction"), "the saved hash is only awaited");
    assert.ok(walletLog.includes("receipt"));
    assert.equal(done.activeRampStore.get(WALLET).stage, "ready", "the flow goes on to startRamp");
  }
});

test("\"Continuar esta venda\" ends on the issue screen for an expired sell, without a retry", () => {
  const flow = sourceFiles().find((file) => file.path === "src/flows/SellFlow.jsx").text;
  assert.match(flow, /adapter\.resumeSell\(\{ rampId, walletAddress: wallet, wallet: seam \}\)\.catch\(\(nextError\) => \{ if \(nextError\?\.code === "SELL_EXPIRED"\) setStep\("issue"\); throw nextError; \}\)/);
  assert.match(flow, /onRetry=\{resume && errorCode !== "SELL_EXPIRED" \?/);
});

test("a finished ramp settles: success goes to history and clears the active ramp", async () => {
  const sdk = fakeSdk({ statuses: [{ currentPhase: "nablaSwap" }, { currentPhase: "complete", status: "COMPLETE", transactionHash: TX_HASH }] });
  const { adapter: live, activeRampStore } = adapter({ sdk });
  const quote = await live.quoteBuy({ symbol: "NVDA", brlAmount: 500 });
  await live.registerBuy({ quote, walletAddress: WALLET });
  await live.startRamp("ramp-fake-1");
  const updates = [];
  const done = await live.pollStatus("ramp-fake-1", { intervalMs: 1, walletAddress: WALLET, onUpdate: (ramp) => updates.push(ramp.currentPhase) });
  assert.deepEqual(updates, ["nablaSwap", "complete"]);
  assert.equal(done.classification, "success");
  assert.equal(done.explorerLink, `https://robinhoodchain.blockscout.com/tx/${TX_HASH}`);
  assert.equal(activeRampStore.get(WALLET), null);
  const [row] = activeRampStore.history(WALLET);
  assert.equal(row.rampId, "ramp-fake-1");
  assert.equal(row.symbol, "NVDA");
  assert.equal(row.rampType, "BUY");
});

test("one operation per device: a new buy or sell never overwrites an unfinished ramp's record", async () => {
  const earlier = { rampId: "sell-earlier", walletAddress: WALLET, rampType: "SELL", stage: "signing", symbol: "NVDA", inputAmount: "0.5", outputAmount: "570" };
  const { adapter: live, sdk, activeRampStore } = adapter({ readBalance: async () => 10n ** 18n });
  activeRampStore.save(earlier);
  activeRampStore.checkpoint("sell-earlier", "squidRouterApprove", TX_HASH);
  const before = activeRampStore.get(WALLET);
  const buyQuote = await live.quoteBuy({ symbol: "TSLA", brlAmount: 500, walletAddress: WALLET });
  await assert.rejects(live.registerBuy({ quote: buyQuote, walletAddress: WALLET }), (error) => error.code === "RAMP_IN_PROGRESS" && error.details.rampId === "sell-earlier");
  const sellQuote = await live.quoteSell({ symbol: "NVDA", tokenAmount: "0.1", walletAddress: WALLET });
  await assert.rejects(live.registerSell({ quote: sellQuote, walletAddress: WALLET, pixKey: "k", wallet: fakeWallet() }), code("RAMP_IN_PROGRESS"));
  assert.equal(sdk.calls.registerRamp.length, 0, "nothing is registered");
  assert.deepEqual(activeRampStore.get(WALLET), before, "the earlier record and its checkpoint are intact");
  assert.match(new StocksRampError("RAMP_IN_PROGRESS").message, /operação em andamento/);
});

test("a record written by another tab during registration stops the key storage (fail closed)", async () => {
  const log = [];
  const sdk = fakeSdk({ log });
  const { adapter: live, activeRampStore } = adapter({ sdk, log });
  const register = sdk.client.registerRamp;
  sdk.client.registerRamp = async (raw, data) => {
    activeRampStore.save({ rampId: "other-tab", walletAddress: WALLET, rampType: "BUY", stage: "registered", symbol: "SPY" });
    return register.call(sdk.client, raw, data);
  };
  const quote = await live.quoteBuy({ symbol: "NVDA", brlAmount: 500, walletAddress: WALLET });
  await assert.rejects(live.registerBuy({ quote, walletAddress: WALLET }), code("RAMP_IN_PROGRESS"));
  assert.equal(activeRampStore.get(WALLET).rampId, "other-tab");
  assert.ok(!log.some((entry) => entry.startsWith("put:")), "no ephemeral keys stored for the refused ramp");
});

test("a sell signs nothing the server asks beyond the quoted token and amount", async () => {
  const walletLog = [];
  // The server asks for an approval above the 0.5 NVDA being sold.
  const sdk = fakeSdk({ unsignedTransactions: [approveTx({ signer: WALLET, amountWei: 10n ** 18n })] });
  const { adapter: live, activeRampStore } = adapter({ sdk, readBalance: async () => 10n ** 18n });
  const quote = await live.quoteSell({ symbol: "NVDA", tokenAmount: "0,5", walletAddress: WALLET });
  await assert.rejects(live.registerSell({ quote, walletAddress: WALLET, pixKey: "k", wallet: fakeWallet(walletLog) }), (error) => error.code === "WALLET_REQUEST_REFUSED");
  assert.deepEqual(walletLog, [], "the wallet was never asked");
  assert.equal(activeRampStore.get(WALLET).stage, "signing", "the registered ramp keeps its record for support");
  // On resume the cap is the locally recorded amount, even when the server now says more.
  const resumeLog = [];
  const rampBody = { id: "ramp-r", type: "SELL", currentPhase: "initial", status: "PENDING", inputCurrency: NVDA, inputAmount: "1", outputCurrency: "BRL", outputAmount: "1100", createdAt: new Date(NOW).toISOString(), unsignedTxs: [approveTx({ signer: WALLET, amountWei: 10n ** 18n })] };
  const resumed = adapter({ session: fakeSession({ "/v1/ramp/ramp-r": rampBody }) });
  resumed.activeRampStore.save({ rampId: "ramp-r", walletAddress: WALLET, rampType: "SELL", stage: "signing", symbol: "NVDA", tokenAddress: NVDA, inputAmount: "0.5" });
  await assert.rejects(resumed.adapter.resumeSell({ rampId: "ramp-r", walletAddress: WALLET, wallet: fakeWallet(resumeLog) }), (error) => error.code === "WALLET_REQUEST_REFUSED");
  assert.deepEqual(resumeLog, []);
  // Another allowlisted token (SGOV) in the same wallet is never approved from an NVDA sell.
  const sgov = STOCK_TOKENS.find((item) => item.symbol === "SGOV").address;
  const otherToken = fakeSdk({ unsignedTransactions: [approveTx({ signer: WALLET, amountWei: 1n, token: sgov })] });
  const third = adapter({ sdk: otherToken, readBalance: async () => 10n ** 18n });
  const sell = await third.adapter.quoteSell({ symbol: "NVDA", tokenAmount: "0,5", walletAddress: WALLET });
  await assert.rejects(third.adapter.registerSell({ quote: sell, walletAddress: WALLET, pixKey: "k", wallet: fakeWallet() }), (error) => error.code === "WALLET_REQUEST_REFUSED");
});

// Proposed gas reserve quote fields.
const RESERVE_FIELDS = { gasReserveAmount: "0.00005", gasReserveCurrency: "ETH", gasReserveFiat: "0.71", gasReserveUsd: "0.135838" };
// The reserve sits inside the network and total fees: 0.30 + 0.71 = 1.01 and 4.05 + 0.71 = 4.76.
const withReserve = (overrides = {}) => ({ networkFeeFiat: "1.01", totalFeeFiat: "4.76", networkFeeUsd: "0.193", ...RESERVE_FIELDS, ...overrides });

test("a buy quote request names the wallet, so Vortex can skip the reserve for a funded one", async () => {
  const base = { network: "robinhood", outputId: NVDA, brlAmount: 500 };
  assert.deepEqual(buildStockBuyRequest({ ...base, destinationAddress: WALLET }), { ...buildStockBuyRequest(base), destinationAddress: WALLET });
  for (const destinationAddress of [undefined, null, "", "0x123", "not-an-address"]) {
    assert.ok(!("destinationAddress" in buildStockBuyRequest({ ...base, destinationAddress })), String(destinationAddress));
  }
  const { adapter: live, sdk } = adapter();
  await live.quoteBuy({ symbol: "NVDA", brlAmount: 500, walletAddress: WALLET });
  assert.equal(sdk.calls.createQuote[0].destinationAddress, WALLET);
  await live.quoteBuy({ symbol: "NVDA", brlAmount: 500 });
  assert.ok(!("destinationAddress" in sdk.calls.createQuote[1]), "no wallet yet: Vortex quotes the full reserve");
  await live.quoteSell({ symbol: "NVDA", tokenAmount: "0.5", walletAddress: WALLET });
  assert.ok(!("destinationAddress" in sdk.calls.createQuote[2]), "a sell has no reserve");
});

test("a buy quote with the gas reserve: its own line, inside the all-in cost and the implied price", async () => {
  const sdk = fakeSdk({ quote: (request) => vortexQuote(request, withReserve()) });
  const quote = await adapter({ sdk }).adapter.quoteBuy({ symbol: "NVDA", brlAmount: 500, walletAddress: WALLET });
  assert.deepEqual({ ...quote.gasReserve }, { amount: "0.00005", amountWei: "50000000000000", currency: "ETH", brl: 0.71, usd: 0.135838 });
  assert.deepEqual(quote.fees, { network: 0.3, service: 3.75, total: 4.76, currency: "BRL" }, "network without the reserve; total with it");
  assert.equal(quote.fees.network + quote.fees.service + quote.gasReserve.brl, quote.fees.total);
  assert.ok(Math.abs(quote.impliedBrlPerToken - (500 - 4.76) / 0.426) < 1e-9, "the price guard never counts the reserve as price");
  assert.equal(quote.brlAmount, 500, "the reserve is paid out of the amount typed, not on top");
  // "0" (a funded wallet, or target 0) is no reserve, and the quote reads as before.
  const zero = fakeSdk({ quote: (request) => vortexQuote(request, { gasReserveAmount: "0", gasReserveCurrency: "ETH", gasReserveFiat: "0.00", gasReserveUsd: "0" }) });
  const plain = await adapter({ sdk: zero }).adapter.quoteBuy({ symbol: "NVDA", brlAmount: 500, walletAddress: WALLET });
  assert.equal(plain.gasReserve, null);
  assert.deepEqual(plain.fees, { network: 0.3, service: 3.75, total: 4.05, currency: "BRL" });
});

test("a malformed or misplaced gas reserve fails closed", () => {
  const buyRequest = buildStockBuyRequest({ network: "robinhood", outputId: NVDA, brlAmount: 500 });
  const sellRequest = buildStockSellRequest({ network: "robinhood", inputId: NVDA, tokenAmount: "0.5" });
  const buy = (overrides) => () => validateStockQuote(vortexQuote(buyRequest, withReserve(overrides)), { direction: "BUY", network: "robinhood", id: NVDA, requested: 500, now: NOW });
  assert.doesNotThrow(buy({}));
  assert.doesNotThrow(buy({ gasReserveUsd: undefined, networkFeeUsd: undefined }));
  assert.throws(buy({ gasReserveAmount: "0.001" }), code("INVALID_FEES"), "more ETH than one purchase may deliver");
  assert.throws(buy({ gasReserveAmount: "-0.00005" }), code("INVALID_FEES"));
  assert.throws(buy({ gasReserveAmount: "5e-5" }), code("INVALID_FEES"));
  assert.throws(buy({ gasReserveCurrency: "USDG" }), code("INVALID_FEES"));
  assert.throws(buy({ gasReserveFiat: undefined }), code("INVALID_FEES"), "ETH delivered without its price");
  assert.throws(buy({ gasReserveFiat: "-0.71" }), code("INVALID_FEES"));
  assert.throws(buy({ gasReserveAmount: "0", gasReserveFiat: "0.71" }), code("INVALID_FEES"), "charged without ETH");
  assert.throws(buy({ networkFeeFiat: "0.30" }), code("INVALID_FEES"), "the reserve left out of the network fee");
  assert.throws(buy({ totalFeeFiat: "4.05" }), code("INVALID_FEES"), "the reserve left out of the total");
  assert.throws(buy({ totalFeeFiat: "5.47" }), code("INVALID_FEES"), "the reserve in the total but not in the network fee (1.01 >= 0.71)");
  assert.throws(buy({ totalFeeFiat: "500" }), code("INVALID_FEES"), "the fees must stay below the amount paid");
  assert.throws(buy({ networkFeeUsd: "0.057" }), code("INVALID_FEES"), "the reserve left out of networkFeeUsd");
  assert.throws(buy({ inputAmount: "500.71" }), code("AMOUNT_MISMATCH"), "the reserve is never added on top of the amount typed");
  assert.throws(() => validateStockQuote(vortexQuote(sellRequest, withReserve()), { direction: "SELL", network: "robinhood", id: NVDA, requested: "0.5", now: NOW }), code("INVALID_FEES"), "a sell never charges a reserve");
  assert.doesNotThrow(() => validateStockQuote(vortexQuote(sellRequest, { gasReserveAmount: "0" }), { direction: "SELL", network: "robinhood", id: NVDA, requested: "0.5", now: NOW }));
});

const TRANSFER = parseAbi(["function transfer(address to, uint256 amount)"]);
/** The fallback sell leg: ONE transfer to the 4663 ephemeral, with realistic gas. */
const transferTx = (amountWei) => ({ phase: "squidRouterNoPermitTransfer", signer: WALLET, network: "robinhood",
  txData: { to: NVDA, data: encodeFunctionData({ abi: TRANSFER, functionName: "transfer", args: [ROUTER, amountWei] }), value: "0", gas: "85000", maxFeePerGas: "25500000" } });

/** fakeWallet with a chosen ETH balance on Robinhood Chain. */
function walletWithEth(balanceHex, log = []) {
  const wallet = fakeWallet(log);
  const request = wallet.provider.request;
  wallet.provider.request = async (args) => (args.method === "eth_getBalance" ? (log.push("eth_getBalance"), balanceHex) : request(args));
  return wallet;
}

test("a sell whose wallet cannot pay its transfer is refused before registering, so a new buy can top the reserve up", async () => {
  // Dust left of a used-up reserve: 0.000001 ETH, while one transfer at the 0.02 gwei floor needs
  // 85,000 x 0.02 gwei x 1.2 = 0.00000204 ETH in the wallet.
  const walletLog = [];
  const sdk = fakeSdk({ unsignedTransactions: [transferTx(5n * 10n ** 17n)] });
  const { adapter: live, activeRampStore } = adapter({ sdk, readBalance: async () => 10n ** 18n });
  const quote = await live.quoteSell({ symbol: "NVDA", tokenAmount: "0,5", walletAddress: WALLET });
  await assert.rejects(live.registerSell({ quote, walletAddress: WALLET, pixKey: "k", wallet: fakeWallet(walletLog, { ethWei: 1_000_000_000_000n }) }),
    (error) => error.code === "INSUFFICIENT_GAS" && error.details.balanceWei === "1000000000000" && error.details.requiredWei === "2040000000000"
      && /a reserva que vem com a compra está no fim ou a taxa de rede subiu/.test(error.message) && /Comprar de novo repõe a reserva/.test(error.message));
  assert.equal(sdk.calls.registerRamp.length, 0, "nothing is registered");
  assert.equal(activeRampStore.get(WALLET), null, "no operation holds this device");
  assert.deepEqual(walletLog, [], "the wallet was never asked");
  const buy = await live.quoteBuy({ symbol: "NVDA", brlAmount: 500, walletAddress: WALLET });
  await live.registerBuy({ quote: buy, walletAddress: WALLET });
  assert.equal(activeRampStore.get(WALLET).rampType, "BUY", "the purchase that tops the reserve up can start right away");
});

test("the check before registering: a higher fee, the exact boundary, and a permit sell needing no ETH", async () => {
  const sell = async ({ wallet, quoteOverrides = {} }) => {
    const sdk = fakeSdk({ quote: (request) => vortexQuote(request, quoteOverrides) });
    const { adapter: live } = adapter({ sdk, readBalance: async () => 10n ** 18n });
    const quote = await live.quoteSell({ symbol: "NVDA", tokenAmount: "0,5", walletAddress: WALLET });
    await live.registerSell({ quote, walletAddress: WALLET, pixKey: "k", wallet });
    return sdk.calls.registerRamp.length;
  };
  // 0.00003 ETH covers a sell at the floor, but not at the 30-day p95 base fee (0.47 gwei): 0.0000479 ETH.
  await assert.rejects(sell({ wallet: fakeWallet([], { ethWei: 30_000_000_000_000n, gasPriceWei: 470_000_000n }) }),
    (error) => error.code === "INSUFFICIENT_GAS" && error.details.requiredWei === "47940000000000");
  assert.equal(await sell({ wallet: fakeWallet([], { ethWei: 30_000_000_000_000n }) }), 1);
  assert.equal(await sell({ wallet: fakeWallet([], { ethWei: 2_040_000_000_000n }) }), 1, "exactly enough registers");
  await assert.rejects(sell({ wallet: fakeWallet([], { ethWei: 2_039_999_999_999n }) }), (error) => error.code === "INSUFFICIENT_GAS");
  await assert.rejects(sell({ wallet: fakeWallet([], { ethWei: 0n }) }), (error) => error.code === "INSUFFICIENT_GAS" && /já não está nesta carteira/.test(error.message));
  // gasless: true (permit sell): no ETH involved, no ETH read.
  const noReads = fakeWallet([], { ethWei: 0n });
  noReads.publicClient.getBalance = async () => { throw new Error("a permit sell reads no ETH"); };
  assert.equal(await sell({ wallet: noReads, quoteOverrides: { gasless: true } }), 1);
});

test("the check before registering covers the gas limit Vortex is asked to send, not only the bare estimate", async () => {
  // Direct transfer: the one transfer carries the estimate plus at most 10 % (gas 85,000) and a max
  // fee of 1.2 x the base fee, so at the 0.02 gwei floor the wallet needs 85,000 x 0.024 gwei =
  // 0.00000204 ETH. 0.000002 ETH covers 77,118 x 1.2 x the base fee but not that transaction: it must be
  // refused before registering, not registered and then refused at the signature.
  const transfer = transferTx(5n * 10n ** 17n);
  const sdk = fakeSdk({ unsignedTransactions: [{ ...transfer, txData: { ...transfer.txData, maxFeePerGas: "24000000" } }] });
  const { adapter: live, activeRampStore } = adapter({ sdk, readBalance: async () => 10n ** 18n });
  const quote = await live.quoteSell({ symbol: "NVDA", tokenAmount: "0,5", walletAddress: WALLET });
  const walletLog = [];
  await assert.rejects(live.registerSell({ quote, walletAddress: WALLET, pixKey: "k", wallet: fakeWallet(walletLog, { ethWei: 2_000_000_000_000n }) }),
    (error) => error.code === "INSUFFICIENT_GAS" && error.details.requiredWei === "2040000000000");
  assert.equal(sdk.calls.registerRamp.length, 0, "nothing is registered");
  assert.equal(activeRampStore.get(WALLET), null, "no operation holds this device, so a new buy can top the reserve up");
  assert.ok(!walletLog.includes("eth_sendTransaction"));
});

// The ETH was enough at the fresh check before registering, then not at the signature (the fee rose
// or the balance changed in between): the sell is registered by then.
test("a sell whose wallet cannot pay the network fee gets the reserve wording, and nothing is broadcast", async () => {
  for (const [balanceHex, wording] of [["0x0", /reserva que vem com a compra já não está nesta carteira/], ["0x2540be400", /≈ 0,00000001 ETH.*≈ 0,0000022 ETH.*a reserva está no fim ou a taxa de rede subiu/]]) {
    const walletLog = [];
    const sdk = fakeSdk({ unsignedTransactions: [transferTx(5n * 10n ** 17n)] });
    const { adapter: live, activeRampStore } = adapter({ sdk, readBalance: async () => 10n ** 18n });
    const quote = await live.quoteSell({ symbol: "NVDA", tokenAmount: "0,5", walletAddress: WALLET });
    await assert.rejects(live.registerSell({ quote, walletAddress: WALLET, pixKey: "k", wallet: walletWithEth(balanceHex, walletLog) }),
      (error) => error.code === "INSUFFICIENT_GAS" && wording.test(error.message) && error.details.requiredWei === (85000n * 25500000n).toString());
    assert.ok(walletLog.includes("eth_getBalance"));
    assert.ok(!walletLog.includes("eth_sendTransaction"), balanceHex);
    assert.equal(activeRampStore.get(WALLET).stage, "signing", "the flow offers \"Continuar esta venda\"");
    // Why the message offers no new purchase (which would top the reserve up): the open sell blocks it.
    const buy = await live.quoteBuy({ symbol: "NVDA", brlAmount: 500, walletAddress: WALLET });
    await assert.rejects(live.registerBuy({ quote: buy, walletAddress: WALLET }), (error) => error.code === "RAMP_IN_PROGRESS");
  }
});

test("the kit's INSUFFICIENT_NATIVE_GAS becomes INSUFFICIENT_GAS; other errors map as before", () => {
  const kitError = Object.assign(new Error("Você precisa de ETH na rede Robinhood Chain para a taxa de rede"), { code: "INSUFFICIENT_NATIVE_GAS", details: { chainId: 4663, balanceWei: "0", requiredWei: "100" } });
  const mapped = mapStocksError(kitError);
  assert.ok(mapped instanceof StocksRampError);
  assert.equal(mapped.code, "INSUFFICIENT_GAS");
  assert.equal(mapped.message, gasShortfallPt(kitError.details));
  assert.equal(mapped.cause, kitError);
  assert.equal(mapStocksError(Object.assign(new Error("x"), { status: 401 })).code, "AUTH_REQUIRED");
  const other = new Error("LowLiquidity");
  assert.equal(mapStocksError(other), other);
});
