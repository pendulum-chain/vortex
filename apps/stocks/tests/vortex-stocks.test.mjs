import assert from "node:assert/strict";
import test from "node:test";
import { BROADCAST_PENDING } from "@vortexfi/consumer-kit";
import { encodeFunctionData, parseAbi } from "viem";
import { localHistoryRows, mergeHistory, serverHistoryRows } from "../src/lib/history.js";
import { RETAIN_AFTER_SEND_MS, StocksRampError } from "../src/lib/ramp-contract.js";
import { STOCK_TOKENS } from "../src/lib/stocks.js";
import { gasShortfallPt } from "../src/lib/gas-reserve.js";
import { buildStockBuyRequest, buildStockSellRequest, createVortexStocksAdapter, mapAvailability, mapStocksError, normalizeStockQuote, validateStockQuote } from "../src/lib/vortex-stocks.js";
import { EPHEMERAL, NOW, NVDA, ROUTER, TX_HASH, approveTx, destinationTransferTx, fakeSdk, fakeSession, fakeWallet, permitTx, stores, vortexQuote } from "./fake-vortex.mjs";
import { WALLET, forbiddenFetch, json, sourceFiles, withFetch } from "./helpers.mjs";

const API = "https://www.vortexfinance.co/api/production";
const code = (expected) => (error) => error instanceof StocksRampError && error.code === expected;

const SOLD_WEI = 5n * 10n ** 17n;
const ATTACKER = "0x000000000000000000000000000000000000dEaD";
function adapter({ enabled = true, sdk = fakeSdk(), session = fakeSession(), kyc, readBalance, log = [], now = () => NOW, readMaintenance = async () => ({ active: false, details: null }) } = {}) {
  const recovery = stores(log);
  const instance = createVortexStocksAdapter({
    enabled, network: "robinhood", apiBase: API, session, activeRampStore: recovery.activeRampStore, ephemeralStore: recovery.ephemeralStore,
    kyc: kyc ?? { getReadiness: async () => ({ kycStatus: "approved", canBuy: true, canSell: true }) },
    createClient: sdk.createClient, readBalance, now, readMaintenance, warn: () => {},
  });
  return { adapter: instance, sdk, ...recovery };
}

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
  const s = adapter({ readBalance: async () => 10n ** 18n,
    readMaintenance: async () => ({ active: ++checks > 1, details: null }) });
  const quote = await s.adapter.quoteSell({ symbol: "NVDA", tokenAmount: "0.5" }), log = [];
  await assert.rejects(s.adapter.registerSell({ quote, walletAddress: WALLET, wallet: fakeWallet(log) }), code("MAINTENANCE_ACTIVE"));
  assert.equal(log.includes("eth_signTypedData_v4"), false);
  assert.equal(checks, 2);
  assert.equal(s.activeRampStore.get(WALLET).stage, "signing");
  assert.deepEqual(s.activeRampStore.get(WALLET).transactions, {});
});

test("fee totals reconcile even without optional reserve/provider extensions", () => {
  const request = buildStockBuyRequest({ network: "robinhood", outputId: "NVDA", brlAmount: 500 });
  for (const fields of [{ networkFeeFiat: "100", processingFeeFiat: "100", totalFeeFiat: "1" }, { networkFeeFiat: "300", processingFeeFiat: "300", totalFeeFiat: "600" }, { networkFeeFiat: " " }, { totalFeeFiat: false }]) {
    assert.throws(() => validateStockQuote(vortexQuote(request, fields), { direction: "BUY", network: "robinhood", id: "NVDA", requested: 500, now: NOW }), code("INVALID_FEES"));
  }
});

test("a delayed initial sell registration cannot sign after its start window", async () => {
  let time = NOW;
  const sdk = fakeSdk();
  const original = sdk.createClient;
  sdk.createClient = async (config) => {
    const client = await original(config), register = client.registerRamp.bind(client);
    return { ...client, registerRamp: async (...args) => { const result = await register(...args); time += 16 * 60_000; return result; } };
  };
  const s = adapter({ sdk, now: () => time, readBalance: async () => 10n ** 18n });
  const quote = await s.adapter.quoteSell({ symbol: "NVDA", tokenAmount: "0.5" });
  const log = [];
  await assert.rejects(s.adapter.registerSell({ quote, walletAddress: WALLET, wallet: fakeWallet(log), pixKey: "test@example.com" }), code("SELL_EXPIRED"));
  assert.equal(log.includes("eth_signTypedData_v4"), false);
});

test("another wallet's pending record does not block this one, and stays unseen and intact", async () => {
  const s = adapter();
  const other = "0x0000000000000000000000000000000000000001";
  s.activeRampStore.save({ rampId: "paid-A", walletAddress: other }); s.activeRampStore.checkpoint("paid-A", "transfer", TX_HASH);
  assert.equal(s.activeRampStore.get(WALLET), null);
  const quote = await s.adapter.quoteBuy({ symbol: "NVDA", brlAmount: 500 });
  const ramp = await s.adapter.registerBuy({ quote, walletAddress: WALLET });
  assert.equal(s.activeRampStore.get(WALLET).rampId, ramp.id);
  assert.equal(s.activeRampStore.get(other).rampId, "paid-A");
  assert.equal(s.activeRampStore.get(other).transactions.transfer, TX_HASH);
});

test("two concurrent buy submissions reserve only one recovery record and register once", async () => {
  const s = adapter(), quote = await s.adapter.quoteBuy({ symbol: "NVDA", brlAmount: 500 });
  const results = await Promise.allSettled([s.adapter.registerBuy({ quote, walletAddress: WALLET }), s.adapter.registerBuy({ quote, walletAddress: WALLET })]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(s.sdk.calls.registerRamp.length, 1);
  assert.equal(s.activeRampStore.get(WALLET).rampId, "ramp-fake-1");
});

test("request builders use network \"robinhood\" and the token symbol", () => {
  assert.deepEqual(buildStockBuyRequest({ network: "robinhood", outputId: "NVDA", brlAmount: 500 }), {
    rampType: "BUY", from: "pix", to: "robinhood", inputAmount: "500", inputCurrency: "BRL", outputCurrency: "NVDA", paymentMethod: "pix", countryCode: "BR", network: "robinhood",
  });
  assert.deepEqual(buildStockSellRequest({ network: "robinhood", inputId: "NVDA", tokenAmount: "0.5" }), {
    rampType: "SELL", from: "robinhood", to: "pix", inputAmount: "0.5", inputCurrency: "NVDA", outputCurrency: "BRL", paymentMethod: "pix", countryCode: "BR", network: "robinhood",
  });
});

test("the adapter identifies the token by its allowlisted symbol, and only that symbol passes", async () => {
  const { adapter: live, sdk } = adapter();
  await live.quoteBuy({ symbol: "NVDA", brlAmount: 500, walletAddress: WALLET });
  assert.equal(sdk.calls.createQuote[0].outputCurrency, "NVDA");
  await live.quoteSell({ symbol: "nvda", tokenAmount: "0,5", walletAddress: WALLET });
  assert.deepEqual(sdk.calls.createQuote[1], buildStockSellRequest({ network: "robinhood", inputId: "NVDA", tokenAmount: "0.5" }));
  // The API echoes the symbol it was asked for: anything else is another route, an address included.
  for (const outputCurrency of [NVDA, "TSLA", "nvda"]) {
    const other = adapter({ sdk: fakeSdk({ quote: (request) => vortexQuote(request, { outputCurrency }) }) });
    await assert.rejects(other.adapter.quoteBuy({ symbol: "NVDA", brlAmount: 500, walletAddress: WALLET }), code("WRONG_ROUTE"), outputCurrency);
  }
});

test("quote validation fails closed", () => {
  const buyRequest = buildStockBuyRequest({ network: "robinhood", outputId: "NVDA", brlAmount: 500 });
  const sellRequest = buildStockSellRequest({ network: "robinhood", inputId: "NVDA", tokenAmount: "0.5" });
  const buy = (overrides) => () => validateStockQuote(vortexQuote(buyRequest, overrides), { direction: "BUY", network: "robinhood", id: "NVDA", requested: 500, now: NOW });
  const sell = (overrides) => () => validateStockQuote(vortexQuote(sellRequest, overrides), { direction: "SELL", network: "robinhood", id: "NVDA", requested: "0.5", now: NOW });
  assert.doesNotThrow(buy({}));
  assert.doesNotThrow(sell({}));
  assert.throws(buy({ network: "ethereum" }), code("WRONG_ROUTE"));
  assert.throws(buy({ to: "ethereum" }), code("WRONG_ROUTE"));
  assert.throws(buy({ from: "sepa" }), code("WRONG_ROUTE"));
  assert.throws(buy({ rampType: "SELL" }), code("WRONG_ROUTE"));
  assert.throws(buy({ inputCurrency: "USD" }), code("WRONG_ROUTE"));
  assert.throws(buy({ outputCurrency: "TSLA" }), code("WRONG_ROUTE"), "a different token");
  assert.throws(buy({ outputCurrency: NVDA }), code("WRONG_ROUTE"), "the id is the symbol, not the address");
  assert.throws(sell({ inputCurrency: NVDA }), code("WRONG_ROUTE"));
  assert.throws(sell({ inputCurrency: "nvda" }), code("WRONG_ROUTE"), "the API echoes the symbol exactly");
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
  assert.throws(buy({ routingStrategy: "other-router" }), code("WRONG_ROUTE"), "no silent fallback route");
  assert.throws(sell({ routingStrategy: "other-router" }), code("WRONG_ROUTE"));
  assert.throws(sell({ partnerFeeFiat: "0.01" }), code("INVALID_FEES"));
  assert.throws(sell({ gasless: false }), code("WRONG_ROUTE"), "this app can only sign a permit");
  assert.throws(sell({ gasless: undefined }), code("WRONG_ROUTE"));
  assert.throws(sell({ gasless: "true" }), code("WRONG_ROUTE"));
  assert.throws(buy({ feeCurrency: "USD" }), code("INVALID_FEES"));
  assert.throws(buy({ inputAmount: "5000" }), code("AMOUNT_MISMATCH"), "BUY inputAmount must be what the user typed");
  assert.throws(sell({ inputAmount: "0.6" }), code("AMOUNT_MISMATCH"), "a SELL must never sell more than requested");
  assert.throws(sell({ inputAmount: "0.5000000000000000001" }), code("INVALID_QUOTE"));
  assert.throws(buy({ providerCosts: [{ id: "bridge", provider: "other-router", amountFiat: "0.50", includedIn: "rate" }] }), code("INVALID_FEES"));
});

test("a normalised quote carries fees, the implied price net of fees and the raw quote", () => {
  const token = STOCK_TOKENS.find((item) => item.symbol === "NVDA");
  const buy = normalizeStockQuote(vortexQuote(buildStockBuyRequest({ network: "robinhood", outputId: "NVDA", brlAmount: 500 })), token, "BUY");
  assert.equal(buy.brlAmount, 500);
  assert.equal(buy.tokenAmount, "0.426");
  assert.equal(buy.tokenAmountWei, "426000000000000000");
  assert.deepEqual(buy.fees, { network: 0.3, service: 3.75, total: 4.05, currency: "BRL" });
  assert.ok(Math.abs(buy.impliedBrlPerToken - (500 - 4.05) / 0.426) < 1e-9);
  assert.equal(buy.expiresAt, NOW + 60_000);
  assert.equal(buy.gasless, false);
  assert.equal(buy.gasReserve, null, "no reserve fields, no reserve");
  assert.equal(buy.simulated, false);
  assert.equal(buy.rawQuote.id, "quote-fake-test-only");
  const sell = normalizeStockQuote(vortexQuote(buildStockSellRequest({ network: "robinhood", inputId: "NVDA", tokenAmount: "1" }), { gasless: true }), token, "SELL");
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
  // Listed with no direction: the corridor is switched off, which the UI calls "em breve".
  assert.deepEqual(mapAvailability([listed({ rampTypes: [] })], { network: "robinhood" }).NVDA, { buy: false, sell: false, reason: "not_enabled" });
  assert.equal(mapAvailability([listed({ rampTypes: undefined })], { network: "robinhood" }).NVDA.reason, "not_enabled");
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

test("a registered buy shows no Pix code unless it delivers this token, to this wallet, in the quoted amount", async () => {
  const QUOTED_WEI = 426n * 10n ** 15n;
  const delivery = (overrides = {}) => ({ unsignedTxs: [destinationTransferTx({ to: WALLET, amountWei: QUOTED_WEI, ...overrides })] });
  const refusals = {
    "to another wallet": () => delivery({ to: ATTACKER }),
    "of another token": () => delivery({ token: STOCK_TOKENS.find((item) => item.symbol === "SGOV").address }),
    "one wei short": () => delivery({ amountWei: QUOTED_WEI - 1n }),
    "one wei over": () => delivery({ amountWei: QUOTED_WEI + 1n }),
    "without a delivery": () => ({ unsignedTxs: [] }),
    "with no list": () => ({ unsignedTxs: undefined }),
    "with two deliveries": () => ({ unsignedTxs: [...delivery().unsignedTxs, ...delivery().unsignedTxs] }),
    "not a token transfer": () => ({ unsignedTxs: [{ phase: "destinationTransfer", txData: { to: NVDA, data: "0xdeadbeef" } }] }),
    "an approve in its place": () => ({ unsignedTxs: [approveTx({ signer: EPHEMERAL, amountWei: QUOTED_WEI, phase: "destinationTransfer" })] }),
    "for another quote": () => ({ quoteId: "quote-other" }),
    "for another amount of BRL": () => ({ inputAmount: "5000" }),
  };
  for (const [label, registeredBuy] of Object.entries(refusals)) {
    const { adapter: live, activeRampStore } = adapter({ sdk: fakeSdk({ registeredBuy }) });
    const quote = await live.quoteBuy({ symbol: "NVDA", brlAmount: 500, walletAddress: WALLET });
    await assert.rejects(live.registerBuy({ quote, walletAddress: WALLET }), (error) => error.code === "WRONG_ROUTE" && error.details.rampId === "ramp-fake-1" && /o código Pix não foi mostrado/.test(error.message), label);
    assert.equal(activeRampStore.get(WALLET), null, `${label}: nothing can be paid, so it does not hold the wallet`);
    assert.deepEqual(activeRampStore.history(WALLET).map((row) => [row.rampId, row.status]), [["ramp-fake-1", "failure"]], `${label}: the code stays findable`);
  }
  // The checksum of an address is not a difference.
  const lower = adapter({ sdk: fakeSdk({ registeredBuy: () => delivery({ to: WALLET.toLowerCase(), token: NVDA.toLowerCase() }) }) });
  const quote = await lower.adapter.quoteBuy({ symbol: "NVDA", brlAmount: 500, walletAddress: WALLET });
  assert.equal((await lower.adapter.registerBuy({ quote, walletAddress: WALLET })).depositQrCode, "pix-code-fake-test-only");
});

test("a failed registration holds nothing: no Pix code or wallet request can have reached the user", async () => {
  const presignError = Object.assign(new Error("Some API failure"), { status: 500, isPublic: true });
  const buy = adapter({ sdk: fakeSdk({ presignError }) });
  const buyQuote = await buy.adapter.quoteBuy({ symbol: "NVDA", brlAmount: 500, walletAddress: WALLET });
  await assert.rejects(buy.adapter.registerBuy({ quote: buyQuote, walletAddress: WALLET }), code("SERVER_ERROR"));
  assert.equal(buy.activeRampStore.get(WALLET), null);
  const sell = adapter({ sdk: fakeSdk({ presignError }), readBalance: async () => 10n ** 18n });
  const walletLog = [];
  const sellQuote = await sell.adapter.quoteSell({ symbol: "NVDA", tokenAmount: "0.5" });
  await assert.rejects(sell.adapter.registerSell({ quote: sellQuote, walletAddress: WALLET, pixKey: "k", wallet: fakeWallet(walletLog) }), code("SERVER_ERROR"));
  assert.equal(sell.activeRampStore.get(WALLET), null);
  assert.deepEqual(walletLog, []);
});

test("a failed registration clears only its own attempt's record", async () => {
  const sdk = fakeSdk();
  const { adapter: live, activeRampStore } = adapter({ sdk });
  sdk.client.registerRamp = async () => {
    activeRampStore.save({ rampId: "other-tab", walletAddress: WALLET, rampType: "BUY", stage: "registering", createdAt: NOW - 1 });
    throw new TypeError("Failed to fetch");
  };
  const quote = await live.quoteBuy({ symbol: "NVDA", brlAmount: 500, walletAddress: WALLET });
  await assert.rejects(live.registerBuy({ quote, walletAddress: WALLET }), code("SERVER_ERROR"));
  assert.equal(activeRampStore.get(WALLET).rampId, "other-tab");
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

test("a sell checks the balance, signs the permit on Robinhood Chain and ends \"ready\"", async () => {
  const walletLog = [];
  const tx = permitTx({ signer: WALLET, amountWei: SOLD_WEI });
  const other = { phase: "uniswapSwap", signer: "0x0000000000000000000000000000000000000001", txData: { to: ROUTER, data: "0x" } };
  const sdk = fakeSdk({ unsignedTransactions: [tx, other] });
  const { adapter: live, activeRampStore } = adapter({ sdk, readBalance: async () => 10n ** 18n });
  const quote = await live.quoteSell({ symbol: "NVDA", tokenAmount: "0,5", walletAddress: WALLET });
  const registered = [];
  const ramp = await live.registerSell({ quote, walletAddress: WALLET, pixKey: "  fake-test-only@example.com ", wallet: fakeWallet(walletLog), onRegistered: (r) => registered.push(r.id) });
  assert.deepEqual(sdk.calls.registerRamp[0].data, { walletAddress: WALLET, pixDestination: "fake-test-only@example.com" });
  assert.deepEqual(registered, ["ramp-fake-1"]);
  assert.deepEqual(walletLog, ["wallet_switchEthereumChain:0x1237", "eth_signTypedData_v4"], "one signature, and no ETH read or spent");
  assert.deepEqual(sdk.calls.submitUserTransactions[0].transactions, [tx], "only the user's own transactions");
  const record = activeRampStore.get(WALLET);
  assert.equal(record.stage, "ready");
  assert.equal(record.ephemeralEvmAddress, EPHEMERAL, "the spender stays pinned for a resume");
  assert.equal(record.rampType, "SELL");
  assert.equal(ramp.direction, "SELL");
  assert.equal(ramp.symbol, "NVDA");
});

test("a permit sell registers with an empty wallet and reads no ETH", async () => {
  const { adapter: live, sdk } = adapter({ readBalance: async () => 10n ** 18n });
  const empty = fakeWallet([], { ethWei: 0n });
  empty.publicClient.getBalance = async () => { throw new Error("a permit sell reads no ETH"); };
  const quote = await live.quoteSell({ symbol: "NVDA", tokenAmount: "0,5", walletAddress: WALLET });
  await live.registerSell({ quote, walletAddress: WALLET, pixKey: "k", wallet: empty });
  assert.equal(sdk.calls.registerRamp.length, 1);
});

test("a sell without a permit is refused at the quote, so it never holds this device", async () => {
  const { adapter: live, sdk, activeRampStore } = adapter({ sdk: fakeSdk({ quote: (request) => vortexQuote(request, { gasless: false }) }), readBalance: async () => 10n ** 18n });
  await assert.rejects(live.quoteSell({ symbol: "NVDA", tokenAmount: "0,5", walletAddress: WALLET }), (error) => error.code === "WRONG_ROUTE" && /Nada foi registrado e seus tokens continuam na sua carteira/.test(error.message));
  assert.equal(sdk.calls.registerRamp.length, 0);
  assert.equal(activeRampStore.get(WALLET), null);
  await live.quoteBuy({ symbol: "NVDA", brlAmount: 500, walletAddress: WALLET });
});

test("the permit's spender is the ephemeral this device generated, never one the API names", async () => {
  const walletLog = [];
  const sdk = fakeSdk({ unsignedTransactions: [permitTx({ signer: WALLET, amountWei: SOLD_WEI, spender: ATTACKER })] });
  const { adapter: live, activeRampStore } = adapter({ sdk, readBalance: async () => 10n ** 18n });
  const quote = await live.quoteSell({ symbol: "NVDA", tokenAmount: "0,5", walletAddress: WALLET });
  await assert.rejects(live.registerSell({ quote, walletAddress: WALLET, pixKey: "k", wallet: fakeWallet(walletLog) }), (error) => error.code === "WALLET_REQUEST_REFUSED");
  assert.deepEqual(walletLog, [], "the wallet was never asked");
  assert.equal(activeRampStore.get(WALLET).stage, "signing");
});

test("this app signs only the permit: the transfer path stays with API clients", async () => {
  const walletLog = [];
  const transfer = { phase: "squidRouterNoPermitTransfer", signer: WALLET, network: "robinhood", txData: { to: NVDA, data: encodeFunctionData({ abi: parseAbi(["function transfer(address to, uint256 amount)"]), functionName: "transfer", args: [EPHEMERAL, SOLD_WEI] }), value: "0", gas: "85000" } };
  const { adapter: live } = adapter({ sdk: fakeSdk({ unsignedTransactions: [transfer] }), readBalance: async () => 10n ** 18n });
  const quote = await live.quoteSell({ symbol: "NVDA", tokenAmount: "0,5", walletAddress: WALLET });
  await assert.rejects(live.registerSell({ quote, walletAddress: WALLET, pixKey: "k", wallet: fakeWallet(walletLog) }), (error) => error.code === "WALLET_REQUEST_REFUSED");
  assert.deepEqual(walletLog, []);
  for (const unsignedTransactions of [[approveTx({ signer: WALLET, amountWei: SOLD_WEI, phase: "stockPermitTransfer" })], [permitTx({ signer: WALLET, amountWei: SOLD_WEI, phase: "squidRouterNoPermitTransfer" })]]) {
    const other = adapter({ sdk: fakeSdk({ unsignedTransactions }), readBalance: async () => 10n ** 18n });
    const sell = await other.adapter.quoteSell({ symbol: "NVDA", tokenAmount: "0,5", walletAddress: WALLET });
    await assert.rejects(other.adapter.registerSell({ quote: sell, walletAddress: WALLET, pixKey: "k", wallet: fakeWallet(walletLog) }), (error) => error.code === "WALLET_REQUEST_REFUSED");
    assert.deepEqual(walletLog, []);
  }
});

test("without the ephemeral on this device's record nothing is signed", async () => {
  const walletLog = [];
  const sdk = fakeSdk();
  const createClient = sdk.createClient;
  sdk.createClient = async (config) => createClient({ ...config, onBeforeEphemeralsStored: (rampId) => config.onBeforeEphemeralsStored(rampId) });
  const { adapter: live, activeRampStore } = adapter({ sdk, readBalance: async () => 10n ** 18n });
  const quote = await live.quoteSell({ symbol: "NVDA", tokenAmount: "0,5", walletAddress: WALLET });
  await assert.rejects(live.registerSell({ quote, walletAddress: WALLET, pixKey: "k", wallet: fakeWallet(walletLog) }), (error) => error.code === "SELL_EXPIRED" && error.details.rampId === "ramp-fake-1" && /Não foi possível conferir esta venda neste aparelho/.test(error.message));
  assert.deepEqual(walletLog, []);
  assert.equal(activeRampStore.get(WALLET).stage, "signing");
});

test("an empty or padded request list is not signed and never counts as signed", async () => {
  for (const unsignedTransactions of [[], [permitTx({ signer: WALLET, amountWei: SOLD_WEI }), permitTx({ signer: WALLET, amountWei: SOLD_WEI, phase: "squidRouterNoPermitTransfer" })]]) {
    const walletLog = [];
    const { adapter: live, activeRampStore, sdk } = adapter({ sdk: fakeSdk({ unsignedTransactions }), readBalance: async () => 10n ** 18n });
    const quote = await live.quoteSell({ symbol: "NVDA", tokenAmount: "0,5", walletAddress: WALLET });
    await assert.rejects(live.registerSell({ quote, walletAddress: WALLET, pixKey: "k", wallet: fakeWallet(walletLog) }), (error) => error.code === "WRONG_ROUTE" && /A carteira não recebeu o pedido desta venda/.test(error.message));
    assert.deepEqual(walletLog, []);
    assert.equal(activeRampStore.get(WALLET).stage, "signing", "never \"ready\"");
    assert.equal(sdk.calls.submitUserTransactions.length, 0);
  }
});

test("a sell above the on-chain balance is refused before registering", async () => {
  const sdk = fakeSdk();
  const { adapter: live } = adapter({ sdk, readBalance: async () => 10n ** 17n });
  const quote = await live.quoteSell({ symbol: "NVDA", tokenAmount: "0.5" });
  await assert.rejects(live.registerSell({ quote, walletAddress: WALLET, pixKey: "k", wallet: fakeWallet() }), code("INSUFFICIENT_BALANCE"));
  assert.equal(sdk.calls.registerRamp.length, 0);
  await assert.rejects(live.registerSell({ quote, walletAddress: WALLET, pixKey: "k", wallet: {} }), code("WALLET_NOT_READY"));
});

test("resuming a sell signs the permit once, keeps the pinned ephemeral and stays \"ready\"", async () => {
  const walletLog = [];
  const rampBody = { id: "ramp-fake-1", type: "SELL", currentPhase: "initial", status: "PENDING", inputCurrency: "NVDA", inputAmount: "0.5", outputCurrency: "BRL", outputAmount: "570", createdAt: new Date(NOW).toISOString(), unsignedTxs: [permitTx({ signer: WALLET, amountWei: SOLD_WEI })] };
  const session = fakeSession({ "/v1/ramp/ramp-fake-1": rampBody });
  const { adapter: live, activeRampStore } = adapter({ session });
  activeRampStore.save({ rampId: "ramp-fake-1", walletAddress: WALLET, rampType: "SELL", stage: "signing", symbol: "NVDA", tokenAddress: NVDA, inputAmount: "0.5", ephemeralEvmAddress: EPHEMERAL });
  const ramp = await live.resumeSell({ rampId: "ramp-fake-1", walletAddress: WALLET, wallet: fakeWallet(walletLog) });
  assert.equal(session.calls[0], "/v1/ramp/ramp-fake-1?showUnsignedTxs=true");
  assert.equal(walletLog.filter((entry) => entry === "eth_signTypedData_v4").length, 1);
  assert.equal(activeRampStore.get(WALLET).stage, "ready");
  assert.equal(activeRampStore.get(WALLET).ephemeralEvmAddress, EPHEMERAL);
  assert.equal(ramp.symbol, "NVDA");
  // Already "ready": nothing is signed again.
  walletLog.length = 0;
  await live.resumeSell({ rampId: "ramp-fake-1", walletAddress: WALLET, wallet: fakeWallet(walletLog) });
  assert.deepEqual(walletLog, []);
});

test("a sell signed again signs only at the token's current nonce, so the token takes one of its permits", async () => {
  const rampBody = (nonce) => ({ id: "ramp-fake-1", type: "SELL", currentPhase: "initial", status: "PENDING", inputCurrency: "NVDA", inputAmount: "0.5", outputCurrency: "BRL", outputAmount: "570", createdAt: new Date(NOW).toISOString(), unsignedTxs: [permitTx({ signer: WALLET, amountWei: SOLD_WEI, nonce })] });
  const record = { rampId: "ramp-fake-1", walletAddress: WALLET, rampType: "SELL", stage: "signing", symbol: "NVDA", tokenAddress: NVDA, inputAmount: "0.5", ephemeralEvmAddress: EPHEMERAL, createdAt: NOW };
  // The first signature reached the server, which answers the resume with the next nonce: refused.
  const walletLog = [];
  const next = adapter({ session: fakeSession({ "/v1/ramp/ramp-fake-1": rampBody(8) }) });
  next.activeRampStore.save(record);
  await assert.rejects(next.adapter.resumeSell({ rampId: "ramp-fake-1", walletAddress: WALLET, wallet: fakeWallet(walletLog, { permitNonce: 7n }) }), (error) => error.code === "WALLET_REQUEST_REFUSED");
  assert.ok(!walletLog.includes("eth_signTypedData_v4"));
  assert.equal(next.activeRampStore.get(WALLET).stage, "signing");
  // The same nonce again: only one of the two signatures can ever be used.
  const same = adapter({ session: fakeSession({ "/v1/ramp/ramp-fake-1": rampBody(7) }) });
  same.activeRampStore.save(record);
  await same.adapter.resumeSell({ rampId: "ramp-fake-1", walletAddress: WALLET, wallet: fakeWallet(walletLog, { permitNonce: 7n }) });
  assert.ok(walletLog.includes("eth_signTypedData_v4"));
});

test("a sell signs again only at the nonce its first signature pinned, and not at all once the token is past it", async () => {
  const walletLog = [];
  const signatures = () => walletLog.filter((entry) => entry === "eth_signTypedData_v4").length;
  const sdk = fakeSdk({ unsignedTransactions: [permitTx({ signer: WALLET, amountWei: SOLD_WEI, nonce: 7 })] });
  const submit = sdk.client.submitUserTransactions;
  // The signature is taken, then the update answers 500: the record stays at "signing".
  sdk.client.submitUserTransactions = async (...args) => { await submit(...args); throw Object.assign(new Error("Internal server error"), { status: 500, isPublic: true }); };
  let served = 8;
  const session = fakeSession({ "/v1/ramp/ramp-fake-1": () => ({ id: "ramp-fake-1", type: "SELL", currentPhase: "initial", status: "PENDING", inputCurrency: "NVDA", inputAmount: "0.5", outputCurrency: "BRL", outputAmount: "570", createdAt: new Date(NOW).toISOString(), unsignedTxs: [permitTx({ signer: WALLET, amountWei: SOLD_WEI, nonce: served })] }) });
  const { adapter: live, activeRampStore } = adapter({ sdk, session, readBalance: async () => 10n ** 18n });
  const quote = await live.quoteSell({ symbol: "NVDA", tokenAmount: "0,5", walletAddress: WALLET });
  await assert.rejects(live.registerSell({ quote, walletAddress: WALLET, pixKey: "k", wallet: fakeWallet(walletLog, { permitNonce: 7n }) }), code("SERVER_ERROR"));
  assert.equal(signatures(), 1);
  assert.equal(activeRampStore.get(WALLET).permitNonce, "7");
  // Permit 7 was used without a start: the token is at 8 and the API asks for a permit at 8.
  await assert.rejects(live.resumeSell({ rampId: "ramp-fake-1", walletAddress: WALLET, wallet: fakeWallet(walletLog, { permitNonce: 8n }) }), (error) => error.code === "SELL_EXPIRED" && /Consulte o suporte/.test(error.message));
  assert.equal(signatures(), 1, "no second permit");
  assert.equal(activeRampStore.get(WALLET).stage, "signing", "kept for support");
  // The token still at the pinned nonce: signed again at it, and the pin stays on the record.
  served = 7;
  sdk.client.submitUserTransactions = submit;
  await live.resumeSell({ rampId: "ramp-fake-1", walletAddress: WALLET, wallet: fakeWallet(walletLog, { permitNonce: 7n }) });
  assert.equal(signatures(), 2);
  assert.equal(activeRampStore.get(WALLET).stage, "ready");
  assert.equal(activeRampStore.get(WALLET).permitNonce, "7");
});

test("a resume without this device's record signs nothing: only the record can pin token, amount and spender", async () => {
  // The API can cause this itself: one failed status clears a sell with no checkpoints, and the retry still reaches this step.
  const walletLog = [];
  const rampBody = { id: "ramp-norecord", type: "SELL", currentPhase: "initial", status: "PENDING", inputCurrency: "NVDA", inputAmount: "5", outputCurrency: "BRL", outputAmount: "5700", createdAt: new Date(NOW).toISOString(), unsignedTxs: [permitTx({ signer: WALLET, amountWei: 5n * 10n ** 18n })] };
  const { adapter: live, activeRampStore } = adapter({ session: fakeSession({ "/v1/ramp/ramp-norecord": rampBody }) });
  await assert.rejects(live.resumeSell({ rampId: "ramp-norecord", walletAddress: WALLET, wallet: fakeWallet(walletLog) }), (error) => error.code === "SELL_EXPIRED" && error.details.rampId === "ramp-norecord" && /Não foi possível conferir esta venda neste aparelho/.test(error.message));
  assert.deepEqual(walletLog, [], "no chain switch, no signature");
  assert.equal(activeRampStore.get(WALLET), null, "and no record written from the server's numbers");
  // Past "initial" nothing is signed, so a lost record only means tracking the sell.
  const running = adapter({ session: fakeSession({ "/v1/ramp/ramp-norecord": { ...rampBody, currentPhase: "fundEphemeral" } }) });
  assert.equal((await running.adapter.resumeSell({ rampId: "ramp-norecord", walletAddress: WALLET, wallet: fakeWallet(walletLog) })).currentPhase, "fundEphemeral");
  assert.deepEqual(walletLog, []);
});

test("a resume with a record from before the ephemeral was pinned, or for an empty list, signs nothing", async () => {
  const walletLog = [];
  const body = (unsignedTxs) => ({ id: "ramp-r", type: "SELL", currentPhase: "initial", status: "PENDING", inputCurrency: "NVDA", inputAmount: "0.5", outputCurrency: "BRL", outputAmount: "570", createdAt: new Date(NOW).toISOString(), unsignedTxs });
  const record = { rampId: "ramp-r", walletAddress: WALLET, rampType: "SELL", stage: "signing", symbol: "NVDA", tokenAddress: NVDA, inputAmount: "0.5" };
  const unpinned = adapter({ session: fakeSession({ "/v1/ramp/ramp-r": body([permitTx({ signer: WALLET, amountWei: SOLD_WEI })]) }) });
  unpinned.activeRampStore.save(record);
  await assert.rejects(unpinned.adapter.resumeSell({ rampId: "ramp-r", walletAddress: WALLET, wallet: fakeWallet(walletLog) }), code("SELL_EXPIRED"));
  // The API withholds the request until presigning passed: an update that was lost must not read as signed.
  const withheld = adapter({ session: fakeSession({ "/v1/ramp/ramp-r": body([]) }) });
  withheld.activeRampStore.save({ ...record, ephemeralEvmAddress: EPHEMERAL });
  await assert.rejects(withheld.adapter.resumeSell({ rampId: "ramp-r", walletAddress: WALLET, wallet: fakeWallet(walletLog) }), code("WRONG_ROUTE"));
  assert.equal(withheld.activeRampStore.get(WALLET).stage, "signing");
  assert.deepEqual(walletLog, []);
});

// The API refuses startRamp 15 minutes after registration (RAMP_START_EXPIRATION_TIME_SECONDS). A
// resume after that must not move the tokens for a sell that can never start.
// phases: the user's requests (the permit, or a transaction for any other phase); sent: those already broadcast (checkpointed) before the tab closed.
// minutesAgo: registration by the server's createdAt; localMinutesAgo: by this device's own record.
function staleSell({ minutesAgo, localMinutesAgo = minutesAgo, phases = ["stockPermitTransfer"], sent = [], walletLog = [] }) {
  const txs = phases.map((phase) => (phase === "stockPermitTransfer" ? permitTx({ signer: WALLET, amountWei: SOLD_WEI }) : approveTx({ signer: WALLET, amountWei: SOLD_WEI, phase })));
  const rampBody = { id: "ramp-old", type: "SELL", currentPhase: "initial", status: "PENDING", inputCurrency: "NVDA", inputAmount: "0.5", outputCurrency: "BRL", outputAmount: "570", createdAt: new Date(NOW - minutesAgo * 60_000).toISOString(), unsignedTxs: txs };
  const setup = adapter({ session: fakeSession({ "/v1/ramp/ramp-old": rampBody }) });
  setup.activeRampStore.save({ rampId: "ramp-old", walletAddress: WALLET, rampType: "SELL", stage: "signing", symbol: "NVDA", tokenAddress: NVDA, inputAmount: "0.5", ephemeralEvmAddress: EPHEMERAL, createdAt: NOW - localMinutesAgo * 60_000 });
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
  assert.ok(walletLog.includes("eth_signTypedData_v4"), "two minutes left: signed as before");
  assert.equal(inTime.activeRampStore.get(WALLET).stage, "ready");
  const sentLog = [];
  const sent = staleSell({ minutesAgo: 20, phases: ["squidRouterNoPermitTransfer", "stockPermitTransfer"], sent: ["squidRouterNoPermitTransfer"], walletLog: sentLog });
  await assert.rejects(sent.resume(), (error) => error.code === "SELL_EXPIRED" && error.details.broadcast === true && /Consulte o suporte com o código da operação/.test(error.message) && !/nova venda/.test(error.message));
  assert.deepEqual(sentLog, [], "the rest is not signed, not even the receipt waited for");
  assert.equal(sent.activeRampStore.get(WALLET).rampId, "ramp-old", "a broadcast sell retains its support/recovery record");
});

test("a signed sell past its start window is settled and asks for a new sell, without a start", async () => {
  const walletLog = [];
  const late = staleSell({ minutesAgo: 20, walletLog });
  late.activeRampStore.save({ ...late.activeRampStore.get(WALLET), stage: "ready" });
  await assert.rejects(late.resume(), (error) => error.code === "SELL_EXPIRED" && error.details.broadcast === false && /nada saiu da sua carteira\. Comece uma nova venda\./.test(error.message));
  assert.deepEqual(walletLog, []);
  assert.equal(late.activeRampStore.get(WALLET), null, "the wallet is free for a new operation");
  assert.equal(late.sdk.calls.startRamp.length, 0);
  // Inside the window a signed sell still goes on to its start.
  const inTime = staleSell({ minutesAgo: 14.5 });
  inTime.activeRampStore.save({ ...inTime.activeRampStore.get(WALLET), stage: "ready" });
  assert.equal((await inTime.resume()).id, "ramp-old");
  assert.equal(inTime.activeRampStore.get(WALLET).stage, "ready");
});

test("a known broadcast survives age-based abandonment until settlement is confirmed", async () => {
  const s = staleSell({ minutesAgo: 61, phases: ["squidRouterNoPermitTransfer"], sent: ["squidRouterNoPermitTransfer"] });
  assert.equal((await s.resume()).classification, "failure");
  assert.equal(s.activeRampStore.get(WALLET).transactions.squidRouterNoPermitTransfer, TX_HASH);
  assert.equal(s.activeRampStore.hasActive(), true);
  const unsigned = staleSell({ minutesAgo: 61 });
  await unsigned.resume(); assert.equal(unsigned.activeRampStore.get(WALLET), null);
});

test("past the day a known broadcast is released to history, with its hash and code", async () => {
  const s = staleSell({ minutesAgo: 24 * 60 + 1, phases: ["squidRouterNoPermitTransfer"], sent: ["squidRouterNoPermitTransfer"] });
  assert.equal((await s.resume()).classification, "failure");
  assert.equal(s.activeRampStore.get(WALLET), null);
  const [row] = s.activeRampStore.history(WALLET);
  assert.deepEqual([row.rampId, row.status, row.explorerLink], ["ramp-old", "failure", `https://robinhoodchain.blockscout.com/tx/${TX_HASH}`]);
});

test("a rejected wallet request's null checkpoint is not a broadcast at the start deadline", async () => {
  const s = staleSell({ minutesAgo: 20 });
  s.activeRampStore.checkpoint("ramp-old", "stockPermitTransfer", null);
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

test("a checkpointed request in a phase this app does not sign is refused, not resumed", async () => {
  const walletLog = [];
  const done = staleSell({ minutesAgo: 5, phases: ["squidRouterNoPermitTransfer"], sent: ["squidRouterNoPermitTransfer"], walletLog });
  await assert.rejects(done.resume(), (error) => error.code === "WALLET_REQUEST_REFUSED");
  assert.deepEqual(walletLog, []);
  assert.equal(done.activeRampStore.get(WALLET).stage, "signing");
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

// What this device keeps when a ramp fails. It holds no funds, but it is what lets the user find them.
function settling({ statuses = [{ currentPhase: "nablaSwap", status: "FAILED" }], record = {}, time = NOW } = {}) {
  let clock = time;
  const log = [];
  const sdk = fakeSdk({ statuses });
  const s = adapter({ sdk, log, now: () => clock });
  s.activeRampStore.save({ rampId: "ramp-1", walletAddress: WALLET, rampType: "BUY", stage: "registered", symbol: "NVDA", inputAmount: "500", outputAmount: "0.426", createdAt: NOW, ...record });
  return { ...s, log, advance: (ms) => { clock += ms; }, read: () => s.adapter.getRamp("ramp-1", { walletAddress: WALLET }) };
}
const AGED_OUT = [{ currentPhase: "initial", status: "PENDING" }];
const HOUR = 60 * 60_000;

test("a failed buy leaves a row with its code and frees the wallet", async () => {
  const s = settling();
  assert.equal((await s.read()).classification, "failure");
  assert.equal(s.activeRampStore.get(WALLET), null);
  const rows = localHistoryRows(s.activeRampStore.history(WALLET));
  assert.deepEqual(rows.map((row) => [row.id, row.status, row.direction, row.symbol, row.brlAmount, row.tokenAmount]), [["ramp-1", "failure", "BUY", "NVDA", 500, "0.426"]]);
});

test("a Pix this device gave up on stays findable, and the worker starting it later shows through", async () => {
  const s = settling({ statuses: AGED_OUT, time: NOW + HOUR + 1 });
  assert.equal((await s.read()).classification, "failure");
  assert.equal(s.activeRampStore.get(WALLET), null, "an unpaid Pix must stop blocking");
  const local = localHistoryRows(s.activeRampStore.history(WALLET));
  assert.equal(local[0].id, "ramp-1");
  const server = serverHistoryRows({ transactions: [{ id: "ramp-1", type: "BUY", from: "pix", to: "robinhood", fromAmount: "500", toAmount: "0.426", toCurrency: "NVDA", status: "PENDING", currentPhase: "nablaSwap", date: new Date(NOW).toISOString() }] }, "robinhood");
  assert.equal(mergeHistory(local, server)[0].status, "processing");
});

test("a failed permit sell, whose tokens the server may have moved, leaves a row with its code", async () => {
  const s = settling({ statuses: [{ type: "SELL", currentPhase: "uniswapSwap", status: "FAILED" }], record: { rampType: "SELL", stage: "ready", inputAmount: "0.5", outputAmount: "570" } });
  await s.read();
  assert.equal(s.activeRampStore.get(WALLET), null);
  const [row] = localHistoryRows(s.activeRampStore.history(WALLET));
  assert.deepEqual([row.id, row.status, row.direction, row.brlAmount, row.tokenAmount], ["ramp-1", "failure", "SELL", 570, "0.5"]);
});

for (const [label, statuses] of [["a failed status", [{ type: "SELL", currentPhase: "nablaSwap", status: "FAILED" }]], ["an aged-out ramp", AGED_OUT]]) {
  for (const [what, checkpoint, link] of [["a hash", TX_HASH, `https://robinhoodchain.blockscout.com/tx/${TX_HASH}`], ["an uncertain send", BROADCAST_PENDING, null]]) {
    test(`${label} with ${what} keeps the sell's record for a day, then lists it`, async () => {
      const s = settling({ statuses, record: { rampType: "SELL", stage: "signing", inputAmount: "0.5", outputAmount: "570" }, time: NOW + 2 * HOUR });
      s.activeRampStore.checkpoint("ramp-1", "squidRouterNoPermitTransfer", checkpoint);
      assert.equal((await s.read()).classification, "failure");
      assert.equal(s.activeRampStore.get(WALLET).transactions.squidRouterNoPermitTransfer, checkpoint);
      assert.deepEqual(s.activeRampStore.history(WALLET), []);
      s.advance(RETAIN_AFTER_SEND_MS - 2 * HOUR);
      await s.read();
      assert.equal(s.activeRampStore.get(WALLET), null, "no longer locked forever");
      const [row] = s.activeRampStore.history(WALLET);
      assert.deepEqual([row.rampId, row.status, row.explorerLink], ["ramp-1", "failure", link]);
    });
  }
}

test("when the row cannot be written the record stays, as the only trace", async () => {
  const s = settling();
  const addHistory = s.activeRampStore.addHistory;
  s.activeRampStore.addHistory = () => { throw new Error("Não foi possível salvar a operação. Pare e contate o suporte."); };
  assert.equal((await s.read()).classification, "failure", "the result is still shown");
  assert.equal(s.activeRampStore.get(WALLET).rampId, "ramp-1");
  s.activeRampStore.addHistory = addHistory;
  await s.read();
  assert.equal(s.activeRampStore.get(WALLET), null);
  assert.equal(s.activeRampStore.history(WALLET)[0].rampId, "ramp-1");
});

test("a failure read without the wallet settles nothing", async () => {
  const s = settling();
  assert.equal((await s.adapter.getRamp("ramp-1")).classification, "failure");
  assert.equal(s.activeRampStore.get(WALLET).rampId, "ramp-1");
});

const gone = () => Object.assign(new Error("Ramp not found"), { status: 404, isPublic: true });
const missing = (error) => error.code === "SERVER_ERROR" && error.status === 404 && /não foi encontrada/.test(error.message);

test("a ramp the API no longer has settles its record, in both the read and the poll", async () => {
  for (const read of [(s) => s.read(), (s) => s.adapter.pollStatus("ramp-1", { walletAddress: WALLET, intervalMs: 1 })]) {
    const s = settling();
    s.sdk.client.getRampStatus = async () => { throw gone(); };
    await assert.rejects(read(s), missing);
    assert.equal(s.activeRampStore.get(WALLET), null);
    assert.deepEqual(s.activeRampStore.history(WALLET).map((row) => [row.rampId, row.status]), [["ramp-1", "failure"]]);
  }
});

test("a 404 from anything in front of the API is not the API saying the ramp is gone", async () => {
  const s = settling();
  s.sdk.client.getRampStatus = async () => { throw Object.assign(new Error("Not Found"), { status: 404 }); };
  await assert.rejects(s.read());
  assert.equal(s.activeRampStore.get(WALLET).rampId, "ramp-1");
  assert.deepEqual(s.activeRampStore.history(WALLET), []);
});

test("a ramp the API no longer has keeps a possible wallet send's record for the day", async () => {
  const s = settling({ record: { rampType: "SELL", stage: "signing" } });
  s.activeRampStore.checkpoint("ramp-1", "squidRouterNoPermitTransfer", TX_HASH);
  s.sdk.client.getRampStatus = async () => { throw gone(); };
  await assert.rejects(s.read(), missing);
  assert.equal(s.activeRampStore.get(WALLET).rampId, "ramp-1");
});

test("the encrypted ephemeral keys go when a ramp completes, and stay for recovering a failed one", async () => {
  const done = settling({ statuses: [{ currentPhase: "complete", status: "COMPLETE" }] });
  await done.read();
  assert.ok(done.log.includes("delete:ramp-1"));
  await done.adapter.pollStatus("ramp-1", { walletAddress: WALLET, intervalMs: 1 });
  const failed = settling();
  await failed.read();
  assert.ok(!failed.log.some((entry) => entry.startsWith("delete:")));
  const unfinished = settling({ statuses: [{ currentPhase: "nablaSwap", status: "PENDING" }] });
  await unfinished.read();
  assert.ok(!unfinished.log.some((entry) => entry.startsWith("delete:")));
});

test("a failed key deletion never touches the result of a completed ramp", async () => {
  const s = settling({ statuses: [{ currentPhase: "complete", status: "COMPLETE" }] });
  s.ephemeralStore.delete = async () => { throw new Error("IndexedDB is unavailable"); };
  assert.equal((await s.read()).classification, "success");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(s.activeRampStore.get(WALLET), null);
});

test("abandoning an unstarted ramp lists it and frees the wallet", async () => {
  const s = settling({ statuses: [{ currentPhase: "initial", status: "PENDING" }] });
  assert.equal((await s.adapter.abandonRamp("ramp-1", { walletAddress: WALLET })).currentPhase, "initial");
  assert.equal(s.activeRampStore.get(WALLET), null);
  assert.deepEqual(s.activeRampStore.history(WALLET).map((row) => [row.rampId, row.status]), [["ramp-1", "failure"]]);
});

test("a ramp that started in the meantime is never abandoned: the paid Pix keeps its record", async () => {
  const s = settling({ statuses: [{ currentPhase: "brlaOnrampMint", status: "PENDING" }] });
  assert.equal((await s.adapter.abandonRamp("ramp-1", { walletAddress: WALLET })).currentPhase, "brlaOnrampMint");
  assert.equal(s.activeRampStore.get(WALLET).rampId, "ramp-1");
  assert.deepEqual(s.activeRampStore.history(WALLET), []);
});

test("abandoning works while the corridor is off, and an unread status abandons nothing", async () => {
  const off = adapter({ enabled: false, sdk: fakeSdk({ statuses: [{ currentPhase: "initial", status: "PENDING" }] }) });
  off.activeRampStore.save({ rampId: "ramp-1", walletAddress: WALLET });
  await off.adapter.abandonRamp("ramp-1", { walletAddress: WALLET });
  assert.equal(off.activeRampStore.get(WALLET), null);
  const s = settling();
  s.sdk.client.getRampStatus = async () => { throw new TypeError("Failed to fetch"); };
  await assert.rejects(s.adapter.abandonRamp("ramp-1", { walletAddress: WALLET }), code("SERVER_ERROR"));
  assert.equal(s.activeRampStore.get(WALLET).rampId, "ramp-1");
});

test("one operation per wallet: a new buy or sell never overwrites an unfinished ramp's record", async () => {
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
  // The server asks for a permit above the 0.5 NVDA being sold.
  const sdk = fakeSdk({ unsignedTransactions: [permitTx({ signer: WALLET, amountWei: 10n ** 18n })] });
  const { adapter: live, activeRampStore } = adapter({ sdk, readBalance: async () => 10n ** 18n });
  const quote = await live.quoteSell({ symbol: "NVDA", tokenAmount: "0,5", walletAddress: WALLET });
  await assert.rejects(live.registerSell({ quote, walletAddress: WALLET, pixKey: "k", wallet: fakeWallet(walletLog) }), (error) => error.code === "WALLET_REQUEST_REFUSED");
  assert.deepEqual(walletLog, [], "the wallet was never asked");
  assert.equal(activeRampStore.get(WALLET).stage, "signing", "the registered ramp keeps its record for support");
  // On resume the cap is the locally recorded amount, even when the server now says more.
  const resumeLog = [];
  const rampBody = { id: "ramp-r", type: "SELL", currentPhase: "initial", status: "PENDING", inputCurrency: "NVDA", inputAmount: "1", outputCurrency: "BRL", outputAmount: "1100", createdAt: new Date(NOW).toISOString(), unsignedTxs: [permitTx({ signer: WALLET, amountWei: 10n ** 18n })] };
  const resumed = adapter({ session: fakeSession({ "/v1/ramp/ramp-r": rampBody }) });
  resumed.activeRampStore.save({ rampId: "ramp-r", walletAddress: WALLET, rampType: "SELL", stage: "signing", symbol: "NVDA", tokenAddress: NVDA, inputAmount: "0.5", ephemeralEvmAddress: EPHEMERAL });
  await assert.rejects(resumed.adapter.resumeSell({ rampId: "ramp-r", walletAddress: WALLET, wallet: fakeWallet(resumeLog) }), (error) => error.code === "WALLET_REQUEST_REFUSED");
  assert.deepEqual(resumeLog, []);
  // Another allowlisted token (SGOV) in the same wallet is never permitted from an NVDA sell, also not when the server's status names it.
  const sgov = STOCK_TOKENS.find((item) => item.symbol === "SGOV").address;
  const otherToken = fakeSdk({ unsignedTransactions: [permitTx({ signer: WALLET, amountWei: SOLD_WEI, token: sgov })] });
  const third = adapter({ sdk: otherToken, readBalance: async () => 10n ** 18n });
  const sell = await third.adapter.quoteSell({ symbol: "NVDA", tokenAmount: "0,5", walletAddress: WALLET });
  await assert.rejects(third.adapter.registerSell({ quote: sell, walletAddress: WALLET, pixKey: "k", wallet: fakeWallet() }), (error) => error.code === "WALLET_REQUEST_REFUSED");
  const fourth = adapter({ session: fakeSession({ "/v1/ramp/ramp-r": { ...rampBody, inputCurrency: "SGOV", inputAmount: "0.5", unsignedTxs: [permitTx({ signer: WALLET, amountWei: SOLD_WEI, token: sgov })] } }) });
  fourth.activeRampStore.save({ rampId: "ramp-r", walletAddress: WALLET, rampType: "SELL", stage: "signing", symbol: "NVDA", tokenAddress: NVDA, inputAmount: "0.5", ephemeralEvmAddress: EPHEMERAL });
  await assert.rejects(fourth.adapter.resumeSell({ rampId: "ramp-r", walletAddress: WALLET, wallet: fakeWallet(resumeLog) }), (error) => error.code === "WALLET_REQUEST_REFUSED");
  assert.deepEqual(resumeLog, []);
});

// Gas reserve quote fields.
const RESERVE_FIELDS = { gasReserveAmount: "0.00005", gasReserveCurrency: "ETH", gasReserveFiat: "0.71", gasReserveUsd: "0.135838" };
// The reserve sits inside the network and total fees: 0.30 + 0.71 = 1.01 and 4.05 + 0.71 = 4.76.
const withReserve = (overrides = {}) => ({ networkFeeFiat: "1.01", totalFeeFiat: "4.76", networkFeeUsd: "0.193", ...RESERVE_FIELDS, ...overrides });

test("a buy quote request names the wallet, so Vortex can skip the reserve for a funded one", async () => {
  const base = { network: "robinhood", outputId: "NVDA", brlAmount: 500 };
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
  const buyRequest = buildStockBuyRequest({ network: "robinhood", outputId: "NVDA", brlAmount: 500 });
  const sellRequest = buildStockSellRequest({ network: "robinhood", inputId: "NVDA", tokenAmount: "0.5" });
  const buy = (overrides) => () => validateStockQuote(vortexQuote(buyRequest, withReserve(overrides)), { direction: "BUY", network: "robinhood", id: "NVDA", requested: 500, now: NOW });
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
  assert.throws(() => validateStockQuote(vortexQuote(sellRequest, withReserve()), { direction: "SELL", network: "robinhood", id: "NVDA", requested: "0.5", now: NOW }), code("INVALID_FEES"), "a sell never charges a reserve");
  assert.doesNotThrow(() => validateStockQuote(vortexQuote(sellRequest, { gasReserveAmount: "0" }), { direction: "SELL", network: "robinhood", id: "NVDA", requested: "0.5", now: NOW }));
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
