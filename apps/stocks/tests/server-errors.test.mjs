import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { BaseError } from "viem";
import { ERROR_CODES, StocksRampError } from "../src/lib/ramp-contract.js";
import { SERVER_ERRORS_PT, createVortexStocksAdapter, mapStocksError } from "../src/lib/vortex-stocks.js";
import { fakeSdk, fakeSession, fakeWallet, stores } from "./fake-vortex.mjs";
import { REPO, WALLET, walk } from "./helpers.mjs";

/** What the SDK throws for an API error: only its errors carry a boolean isPublic. */
const sdkError = (message, status = 400, name = "VortexSdkError") => Object.assign(new Error(message), { name, status, isPublic: true });
const ENGLISH = /\b(the|this|please|not|amount|quote|ramp|invalid|failed)\b/i;

test("every message in the table is one the backend or the SDK really sends", () => {
  const sources = [...walk(join(REPO, "apps/api/src/api")).filter((path) => path.endsWith(".ts") && !/\.test\.ts$|__tests__/.test(path)), join(REPO, "packages/sdk/src/errors.ts"), join(REPO, "packages/shared/src/endpoints/quote.endpoints.ts")]
    .map((path) => readFileSync(path, "utf8")).join("\n");
  for (const message of Object.keys(SERVER_ERRORS_PT)) assert.ok(sources.includes(message), `no backend source says "${message}"`);
});

test("every known server message reaches the UI in Portuguese, with a real error code and its status", () => {
  for (const [message, { code }] of Object.entries(SERVER_ERRORS_PT)) {
    const cause = sdkError(message, 503);
    const mapped = mapStocksError(cause);
    assert.ok(mapped instanceof StocksRampError, message);
    assert.equal(mapped.code, code, message);
    assert.ok(ERROR_CODES.includes(mapped.code), message);
    assert.doesNotMatch(mapped.message, ENGLISH, message);
    assert.equal(mapped.status, 503);
    assert.equal(mapped.cause, cause);
  }
  assert.equal(mapStocksError(sdkError("Trading in this token is paused by the issuer. Please try again later.")).message, "Negociação pausada pelo emissor. Tente novamente mais tarde.");
  assert.equal(mapStocksError(sdkError("This endpoint requires authentication.")).code, "AUTH_REQUIRED", "back to the e-mail code");
});

test("the same messages with a value inside are worded too", () => {
  const word = (message) => mapStocksError(sdkError(message));
  assert.match(word("Input amount below minimum BUY limit of 20.00 R$").message, /pelo menos R\$\s20,00/);
  assert.match(word("Input amount exceeds maximum BUY limit of 10000.00 R$").message, /no máximo R\$\s10\.000,00/);
  assert.match(word("Output amount below minimum SELL limit of 20.00 R$").message, /pelo menos R\$\s20,00/);
  assert.equal(word("Output amount exceeds maximum SELL limit of 10000.00 R$").code, "INVALID_QUOTE");
  assert.equal(word("Quote is consumed").code, "INVALID_QUOTE");
  const maintenance = word("Vortex services are temporarily unavailable during scheduled maintenance: Upgrade - Back soon");
  assert.equal(maintenance.code, "MAINTENANCE_ACTIVE");
  assert.match(maintenance.message, /em manutenção/);
  const balance = mapStocksError(sdkError("Wallet 0x1 holds less than the required 0.5 NVDA on robinhood for this offramp", 400, "InsufficientBalanceError"));
  assert.equal(balance.code, "INSUFFICIENT_BALANCE");
  assert.match(balance.message, /Saldo de tokens insuficiente/);
});

test("no other SDK error reaches the UI in English", () => {
  for (const cause of [sdkError("Internal server error", 500), sdkError("Unknown API error", 500), Object.assign(new Error("API request failed for /v1/ramp/start: 502 Bad Gateway"), { status: 502, isPublic: false }), Object.assign(new Error("Failed to sign transactions: no nonce"), { status: 500, isPublic: false })]) {
    const mapped = mapStocksError(cause);
    assert.equal(mapped.code, "SERVER_ERROR", cause.message);
    assert.equal(mapped.message, "A operação não pôde ser concluída. Tente novamente em instantes.");
  }
  const offline = mapStocksError(new TypeError("Failed to fetch"));
  assert.equal(offline.code, "SERVER_ERROR");
  assert.match(offline.message, /Verifique sua internet/);
});

test("a chain read that failed reaches the UI in Portuguese, without the RPC's technical text", () => {
  const cause = new BaseError("HTTP request failed.", { metaMessages: ["URL: https://rpc.mainnet.chain.robinhood.com/"] });
  const mapped = mapStocksError(cause);
  assert.ok(mapped instanceof StocksRampError);
  assert.equal(mapped.code, "SERVER_ERROR");
  assert.doesNotMatch(mapped.message, ENGLISH);
  assert.doesNotMatch(mapped.message, /https?:|rpc\./i);
  assert.match(mapped.message, /Robinhood Chain/);
  assert.equal(mapped.cause, cause);
});

test("the wallet's and the kit's own errors keep their meaning, and a known message counts through the session too", () => {
  const rejected = Object.assign(new Error("User rejected the request"), { code: 4001 });
  assert.equal(mapStocksError(rejected), rejected);
  const refused = Object.assign(new Error("Esta carteira não assina isso."), { code: "WALLET_REQUEST_REFUSED", status: 0 });
  assert.equal(mapStocksError(refused), refused);
  const stale = new StocksRampError("SELL_EXPIRED", "O prazo terminou.");
  assert.equal(mapStocksError(stale), stale);
  const aborted = new DOMException("Aborted", "AbortError");
  assert.equal(mapStocksError(aborted), aborted);
  // A resumed sell reads the ramp through the kit's session, whose 404 keeps the API's text.
  const session = Object.assign(new Error("Ramp not found"), { name: "VortexError", status: 404, code: "HTTP_404" });
  assert.equal(mapStocksError(session).message, "Esta operação não foi encontrada. Consulte o suporte com o código da operação.");
});

test("the adapter's calls answer in Portuguese, and a switched-off corridor is still \"em breve\"", async () => {
  const recovery = stores();
  const live = (sdk, session = fakeSession()) => createVortexStocksAdapter({ enabled: true, apiBase: "https://api.example.test", session, kyc: {}, ...recovery, createClient: sdk.createClient, readMaintenance: async () => ({ active: false, details: null }), warn: () => {} });
  const fails = (message, status) => fakeSdk({ quote: () => { throw sdkError(message, status); } });
  await assert.rejects(live(fails("This token is not available on Robinhood Chain.")).quoteBuy({ symbol: "NVDA", brlAmount: 500 }), { code: "TOKEN_NOT_ALLOWED", message: "Este token não está disponível aqui.", status: 400 });
  await assert.rejects(live(fails("Trading in this token is paused by the issuer. Please try again later.", 503)).quoteSell({ symbol: "NVDA", tokenAmount: "1" }), { code: "TOKEN_UNAVAILABLE", status: 503 });
  await assert.rejects(live(fails('Invalid network: "unknown" provided')).quoteBuy({ symbol: "NVDA", brlAmount: 500 }), { code: "NETWORK_NOT_SUPPORTED" });
  const resume = live(fakeSdk(), fakeSession({ "/v1/ramp/gone": Object.assign(new Error("Ramp not found"), { status: 404 }) }));
  await assert.rejects(resume.resumeSell({ rampId: "gone", walletAddress: WALLET, wallet: fakeWallet() }), (error) => error instanceof StocksRampError && /não foi encontrada/.test(error.message));
});
