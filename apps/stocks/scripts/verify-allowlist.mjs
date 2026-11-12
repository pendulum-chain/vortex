#!/usr/bin/env node
// Manual pre-release check of the bundled allowlist (src/lib/stocks.js). Needs the network, so it
// is NOT part of CI. Read-only: it only sends GET requests and eth_call reads.
//   1. RHJ registry (https://api.robinhood.com/rhj/assets): every launch token is listed and active
//      at the same chain-4663 address, with 18 decimals and the same ISIN; not-tokenized names are
//      still absent; the multiplier drift since the snapshot is reported.
//   2. Robinhood Chain (public RPC or --rpc <url>): symbol(), decimals(), uiMultiplier(), paused(),
//      oraclePaused() for every token in one multicall.
//   3. CoinGecko simple/price: every coingeckoId returns a BRL price.
//   4. RHJ corporate actions: CORPORATE_ACTIONS is at most 14 days old and lists every pending action
//      of a launch token (the detail screen's "Pausa prevista pelo emissor" reads only the snapshot).
// Usage: node apps/stocks/scripts/verify-allowlist.mjs [--rpc https://…]
// Exit code 1 when an address, decimals, ISIN, symbol, price or corporate-action check fails.
import { createPublicClient, formatUnits, getAddress, http, parseAbi } from "viem";
import { robinhoodChain, withRpcOverride, rpcUrl } from "@vortexfi/consumer-kit";
import { buildPricesUrl, mapSimplePrice } from "../src/lib/market.js";
import { CORPORATE_ACTIONS, CORPORATE_ACTIONS_SEEN_AT, NOT_TOKENIZED, STOCK_TOKENS, WATCHLIST, findStockByAddress } from "../src/lib/stocks.js";

const REGISTRY = "https://api.robinhood.com/rhj/assets";
const CORPORATE_ACTIONS_URL = "https://api.robinhood.com/rhj/corporate-actions";
const MAX_SNAPSHOT_AGE_DAYS = 14;
const rpcIndex = process.argv.indexOf("--rpc");
const rpcOverride = rpcIndex > 0 ? process.argv[rpcIndex + 1] : "";
const failures = [];
const fail = (message) => { failures.push(message); console.log(`  FAIL ${message}`); };
const ok = (message) => console.log(`  ok   ${message}`);
const info = (message) => console.log(`  info ${message}`);

async function getJson(url) {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}`);
  return response.json();
}

async function checkRegistry() {
  console.log(`1. RHJ registry ${REGISTRY}`);
  const body = await getJson(REGISTRY);
  const assets = Array.isArray(body) ? body : body.results || body.assets || [];
  const bySymbol = new Map(assets.map((asset) => [asset.tokenSymbol, asset]));
  info(`${assets.length} assets listed`);
  for (const token of STOCK_TOKENS) {
    const asset = bySymbol.get(token.symbol);
    const deployment = asset?.deployments?.find((item) => item.chainId === 4663);
    if (!asset || !deployment) { fail(`${token.symbol} is not in the registry on chain 4663`); continue; }
    if (getAddress(deployment.contractAddress) !== token.address) fail(`${token.symbol} address ${deployment.contractAddress} != ${token.address}`);
    else if (asset.status !== "ASSET_STATUS_ACTIVE") fail(`${token.symbol} status ${asset.status}`);
    else if (Number(asset.tokenDecimals) !== token.decimals) fail(`${token.symbol} decimals ${asset.tokenDecimals}`);
    else if (asset.isin !== token.isin) fail(`${token.symbol} ISIN ${asset.isin} != ${token.isin}`);
    else ok(`${token.symbol} ${token.address}`);
    if (asset.currentMultiplier && asset.currentMultiplier !== token.multiplierSnapshot) info(`${token.symbol} multiplier ${token.multiplierSnapshot} -> ${asset.currentMultiplier} (snapshot only; the chain read wins)`);
    if (asset.pendingMultiplier) info(`${token.symbol} pending multiplier ${asset.pendingMultiplier}`);
  }
  for (const item of NOT_TOKENIZED) if (bySymbol.has(item.symbol)) info(`${item.symbol} is now tokenized: review NOT_TOKENIZED`);
  for (const item of WATCHLIST) if (!bySymbol.has(item.symbol)) info(`${item.symbol} (watchlist) is no longer in the registry`);
}

async function checkChain() {
  const chain = withRpcOverride(robinhoodChain, rpcOverride);
  console.log(`2. Robinhood Chain ${rpcUrl(chain)}`);
  const client = createPublicClient({ chain, transport: http(rpcUrl(chain), { timeout: 15_000 }) });
  const abi = parseAbi(["function symbol() view returns (string)", "function decimals() view returns (uint8)", "function uiMultiplier() view returns (uint256)", "function paused() view returns (bool)", "function oraclePaused() view returns (bool)"]);
  const names = ["symbol", "decimals", "uiMultiplier", "paused", "oraclePaused"];
  const results = await client.multicall({ allowFailure: true, contracts: STOCK_TOKENS.flatMap((token) => names.map((functionName) => ({ address: token.address, abi, functionName }))) });
  info(`block ${await client.getBlockNumber()}`);
  STOCK_TOKENS.forEach((token, index) => {
    const [symbol, decimals, multiplier, paused, oraclePaused] = results.slice(index * names.length, (index + 1) * names.length).map((result) => (result.status === "success" ? result.result : null));
    if (symbol !== token.symbol) fail(`${token.symbol} on-chain symbol() = ${symbol}`);
    else if (Number(decimals) !== 18) fail(`${token.symbol} decimals() = ${decimals}`);
    else ok(`${token.symbol} symbol/decimals, multiplier ${multiplier == null ? "?" : formatUnits(multiplier, 18)}${paused || oraclePaused ? " PAUSED" : ""}`);
  });
}

async function checkPrices() {
  console.log("3. CoinGecko simple/price");
  const prices = mapSimplePrice(await getJson(buildPricesUrl()));
  for (const token of STOCK_TOKENS) {
    if (prices[token.symbol]) ok(`${token.symbol} R$ ${prices[token.symbol].brl}`);
    else fail(`${token.symbol} has no CoinGecko price (${token.coingeckoId})`);
  }
}

async function checkCorporateActions() {
  console.log(`4. RHJ corporate actions ${CORPORATE_ACTIONS_URL} (snapshot ${CORPORATE_ACTIONS_SEEN_AT})`);
  const ageDays = Math.floor((Date.now() - Date.parse(`${CORPORATE_ACTIONS_SEEN_AT}T00:00:00Z`)) / 86_400_000);
  if (!(ageDays <= MAX_SNAPSHOT_AGE_DAYS)) fail(`CORPORATE_ACTIONS is ${ageDays} days old (max ${MAX_SNAPSHOT_AGE_DAYS}): refresh it and CORPORATE_ACTIONS_SEEN_AT in src/lib/stocks.js`);
  const body = await getJson(CORPORATE_ACTIONS_URL);
  const today = new Date().toISOString().slice(0, 10);
  const bundled = new Set(CORPORATE_ACTIONS.map((action) => `${action.symbol} ${action.processDate}`));
  for (const action of body.corpActions || []) {
    const date = action.processDate ? `${action.processDate.year}-${String(action.processDate.month).padStart(2, "0")}-${String(action.processDate.day).padStart(2, "0")}` : "";
    const token = (action.deployments || []).filter((item) => item.chainId === 4663).map((item) => findStockByAddress(item.contractAddress)).find(Boolean);
    if (!token || action.status !== "CORPORATE_ACTION_STATUS_IN_PROGRESS" || date < today) continue;
    if (bundled.has(`${token.symbol} ${date}`)) ok(`${token.symbol} ${date} ${action.type}`);
    else fail(`${token.symbol} ${date} ${action.type} is pending but missing from CORPORATE_ACTIONS`);
  }
}

for (const step of [checkRegistry, checkChain, checkPrices, checkCorporateActions]) {
  try { await step(); } catch (error) { fail(`${step.name}: ${error.message}`); }
}
console.log(failures.length ? `\n${failures.length} check(s) failed.` : "\nAll checks passed.");
process.exitCode = failures.length ? 1 : 0;
