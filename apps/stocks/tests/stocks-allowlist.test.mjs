import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { getAddress } from "viem";
import {
  ALLOWLIST_SNAPSHOT, COLLECTIONS, CORPORATE_ACTIONS, CORPORATE_ACTIONS_SEEN_AT, CROSS_LINKS, DEFAULT_ORDER, NOT_TOKENIZED, SELL_NETWORK_FEE_PT, SHARED_COPY_PT, STOCK_TOKENS, VOLATILITY_BADGE, WATCHLIST,
  findStock, findStockByAddress, isVolatile, riskNotesPt, searchHitNotePt, searchStocks, tokensInCollection,
} from "../src/lib/stocks.js";
import { APP, REPO, sourceFiles } from "./helpers.mjs";

// ISIN: 2 letters, 9 alphanumerics, 1 check digit (Luhn over the letter-expanded string).
function validIsin(isin) {
  if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) return false;
  const digits = [...isin].map((char) => (/[A-Z]/.test(char) ? String(char.charCodeAt(0) - 55) : char)).join("");
  let sum = 0;
  [...digits].reverse().forEach((char, index) => {
    let value = Number(char);
    if (index % 2 === 1) { value *= 2; if (value > 9) value -= 9; }
    sum += value;
  });
  return sum % 10 === 0;
}

test("12 launch tokens in exactly the default order, SPY first", () => {
  assert.equal(STOCK_TOKENS.length, 12);
  assert.deepEqual(STOCK_TOKENS.map((token) => token.symbol), [...DEFAULT_ORDER]);
  assert.equal(STOCK_TOKENS[0].symbol, "SPY");
  assert.equal(STOCK_TOKENS[0].role, "default-first-buy");
  assert.ok(Object.isFrozen(STOCK_TOKENS) && STOCK_TOKENS.every(Object.isFrozen));
  assert.equal(ALLOWLIST_SNAPSHOT.chainId, 4663);
});

test("addresses are EIP-55 checksummed, unique, 18 decimals, valid ISINs", () => {
  const symbols = new Set();
  const addresses = new Set();
  const isins = new Set();
  const coingecko = new Set();
  for (const token of STOCK_TOKENS) {
    assert.equal(getAddress(token.address), token.address, `${token.symbol} address is not EIP-55`);
    assert.equal(token.decimals, 18);
    assert.ok(validIsin(token.isin), `${token.symbol} ISIN ${token.isin}`);
    assert.match(token.coingeckoId, /^[a-z0-9-]+$/);
    assert.match(token.chart.coingeckoId, /^[a-z0-9-]+$/);
    assert.ok(["xstocks-proxy", "token"].includes(token.chart.source));
    if (token.chart.source === "token") assert.equal(token.chart.coingeckoId, token.coingeckoId);
    if (token.chainlinkFeed) assert.equal(getAddress(token.chainlinkFeed), token.chainlinkFeed);
    assert.match(token.multiplierSnapshot, /^1\.\d{18}$/);
    assert.ok(["stock", "etf"].includes(token.type));
    assert.ok(token.namePt && token.descriptionPt && token.underlyingName);
    symbols.add(token.symbol); addresses.add(token.address.toLowerCase()); isins.add(token.isin); coingecko.add(token.coingeckoId);
  }
  assert.equal(symbols.size, 12);
  assert.equal(addresses.size, 12);
  assert.equal(isins.size, 12);
  assert.equal(coingecko.size, 12);
});

test("all launch tokens are guard tier A and volatile ones carry the badge", () => {
  assert.ok(STOCK_TOKENS.every((token) => token.guardTier === "A"));
  assert.deepEqual(STOCK_TOKENS.filter(isVolatile).map((token) => token.symbol), ["TSLA", "SPCX", "MU"]);
  assert.equal(VOLATILITY_BADGE, "Oscila mais");
  assert.deepEqual(riskNotesPt(findStock("SPCX")), ["O preço pode oscilar muito."]);
  assert.deepEqual(riskNotesPt(findStock("SGOV")), ["Rendimento reinvestido no token; não há pagamento em dinheiro."]);
  assert.deepEqual(riskNotesPt(findStock("AAPL")), []);
});

test("4 collections match the tokens that list them, and every token is in one", () => {
  assert.deepEqual(COLLECTIONS.map((collection) => collection.id), ["fundos-de-indice", "big-techs", "inteligencia-artificial", "mais-negociadas"]);
  for (const collection of COLLECTIONS) {
    for (const ticker of collection.tickers) assert.ok(findStock(ticker), `${collection.id}: ${ticker} is not a launch token`);
    assert.deepEqual([...collection.tickers].sort(), tokensInCollection(collection.id).map((token) => token.symbol).sort(), collection.id);
  }
  const ids = new Set(COLLECTIONS.map((collection) => collection.id));
  for (const token of STOCK_TOKENS) {
    assert.ok(token.collections.length > 0, `${token.symbol} is in no collection`);
    for (const id of token.collections) assert.ok(ids.has(id), `${token.symbol}: unknown collection ${id}`);
  }
});

test("watchlist and not-tokenized names carry no address and never overlap the launch tokens", () => {
  for (const item of [...WATCHLIST, ...NOT_TOKENIZED]) {
    assert.equal(findStock(item.symbol), null, `${item.symbol} is also a launch token`);
    assert.ok(!("address" in item), `${item.symbol} carries an address`);
    assert.doesNotMatch(JSON.stringify(item), /0x[0-9a-fA-F]{40}/);
  }
  assert.deepEqual(WATCHLIST.map((item) => item.symbol), ["NU", "AMD", "PLTR", "TSM", "MSTR", "NFLX", "VTI", "LLY", "JNJ"]);
  assert.deepEqual(NOT_TOKENIZED.map((item) => item.symbol), ["MELI", "INTR", "KO", "BRK.B", "XP", "DIS", "O"]);
});

test("lookalike, excluded and settlement addresses are absent from the allowlist", () => {
  const forbidden = [
    "0xCA9c78Dd337A67F6e0077F65F5E9218719d30eDf", // NET "NetNet" lookalike
    "0x49bac47750F3dCdBa49350B5D74fd399e90f97C6", // BULL lookalike
    "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", // USDG (settlement stablecoin, not a Stock Token)
    "0x0A3B763d66c0e8c7555c986A3701E1DC1Bf3954F", // "Paxos USDG" lookalike
    "0xC9a981FEE1F9DEc688bb123ccDeCc63D0deBFC4e", // GLD (duplicates ouro.)
    "0xd63ABB2C13d7a8421a8017a712802053568e3C1D", // SCHD (failed the price guard, +14.86%)
  ];
  for (const address of forbidden) assert.equal(findStockByAddress(address), null, address);
  assert.equal(findStock("GLD"), null);
  assert.equal(findStock("SCHD"), null);
});

test("lookups are case-insensitive and limited to launch tokens", () => {
  assert.equal(findStock("nvda").symbol, "NVDA");
  assert.equal(findStock(" spy ").symbol, "SPY");
  assert.equal(findStock("NU"), null);
  assert.equal(findStockByAddress("0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec").symbol, "NVDA");
});

test("search finds BDR tickers, accents, watchlist, not-tokenized names and the gold cross-link", () => {
  assert.equal(searchStocks("nvdc34")[0].token.symbol, "NVDA");
  assert.equal(searchStocks("NVDC34")[0].token.symbol, "NVDA");
  assert.equal(searchStocks("ivvb11")[0].token.symbol, "SPY");
  assert.equal(searchStocks("apple")[0].token.symbol, "AAPL");
  assert.equal(searchStocks("Tesouro")[0].token.symbol, "SGOV");
  assert.equal(searchStocks("reserva em dolar")[0].token.symbol, "SGOV");
  assert.equal(searchStocks("S&P 500")[0].token.symbol, "SPY");
  const nubank = searchStocks("ações nubank");
  assert.equal(nubank[0].kind, "watchlist");
  assert.equal(nubank[0].item.symbol, "NU");
  assert.equal(searchHitNotePt(nubank[0]), "Nubank (NU): em avaliação, ainda não disponível no fatia.");
  const meli = searchStocks("meli");
  assert.equal(meli[0].kind, "not_tokenized");
  assert.equal(searchHitNotePt(meli[0]), "MercadoLibre ainda não existe como Stock Token na Robinhood Chain.");
  const gold = searchStocks("ouro");
  assert.equal(gold[0].kind, "cross_link");
  assert.equal(gold[0].link.href, "/pt-br/gold/");
  assert.equal(searchStocks("GLD")[0].kind, "cross_link");
  assert.deepEqual(searchStocks(""), []);
  assert.deepEqual(searchStocks("zzzz-nothing"), []);
  assert.deepEqual(CROSS_LINKS[0].terms, ["gld", "ouro", "gold", "paxg"]);
});

test("pending corporate actions name launch tokens and the shared copy says what you buy", () => {
  assert.deepEqual(CORPORATE_ACTIONS.map((action) => `${action.symbol} ${action.processDate}`), ["META 2026-09-28", "NVDA 2026-10-01", "QQQ 2026-10-08"]);
  assert.match(CORPORATE_ACTIONS_SEEN_AT, /^\d{4}-\d{2}-\d{2}$/, "the verify script needs the snapshot date");
  for (const action of CORPORATE_ACTIONS) assert.ok(findStock(action.symbol));
  assert.match(SHARED_COPY_PT.whatYouBuy, /Stock Tokens/);
  assert.match(SHARED_COPY_PT.whatYouBuy, /não dá direito a voto/);
});

test("a token logo, once set, exists in public/ (until design delivers, the UI shows a ticker chip)", () => {
  for (const token of STOCK_TOKENS) if (token.logo) assert.ok(existsSync(join(APP, "public", token.logo)), token.logo);
});

// The app bundles its own list and the API pins its own: they must name the same contracts.
test("the allowlist matches the stock tokens in the shared EVM token config", () => {
  const config = readFileSync(join(REPO, "packages/shared/src/tokens/evm/config.ts"), "utf8");
  const shared = [...config.matchAll(/evmToken\(Networks\.Robinhood, "(\w+)", (\d+), "(0x[0-9a-fA-F]{40})"/g)]
    .filter(([, symbol]) => !["ETH", "USDG"].includes(symbol))
    .map(([, symbol, decimals, address]) => ({ symbol, decimals: Number(decimals), address }));
  assert.equal(shared.length, 12, "the config's format changed: this comparison no longer reads it");
  const byAddress = (a, b) => a.address.localeCompare(b.address);
  assert.deepEqual(STOCK_TOKENS.map(({ symbol, decimals, address }) => ({ symbol, decimals, address })).sort(byAddress), shared.sort(byAddress));
});

// A sell's network fee is part of its own quote. Every "venda e receba no Pix" promise says how the
// fee is covered, and no screen still tells the user to get ETH.
test("every sell-to-Pix promise says the fee is covered without buying ETH", () => {
  assert.match(SELL_NETWORK_FEE_PT, /não precisa comprar ETH/);
  assert.match(SELL_NETWORK_FEE_PT, /já vem descontada do valor que você recebe/);
  assert.doesNotMatch(SELL_NETWORK_FEE_PT, /reserva/, "a permit sell does not spend the reserve");
  const files = sourceFiles();
  const promises = files.flatMap((file) => file.text.split("\n").filter((line) => /[Vv]enda[^.<]*receba no Pix/.test(line)).map((line) => ({ path: file.path, line })));
  assert.ok(promises.length > 0, "sell-to-Pix promises are still present and must explain their network fees");
  for (const { path, line } of promises) assert.match(line, /SELL_NETWORK_FEE_PT|sem comprar ETH/, `${path}: ${line.trim()}`);
  for (const file of files) {
    assert.doesNotMatch(file.text, /precisa de um pouco de ETH|A compra não inclui ETH|SELL_NEEDS_ETH_PT/, file.path);
  }
});
