#!/usr/bin/env node
// Read-only quote simulation. Does not create ramps, orders, signatures, approvals or payments.
// Run from repository root: node apps/stocks/scripts/quote-pilot.mjs --out /absolute/path/report.json
import { writeFileSync } from "node:fs";
import { parseUnits } from "viem";
import { STOCK_TOKENS } from "../src/lib/stocks.js";
import { analyzeBuy } from "./quote-costs.mjs";

const args = process.argv.slice(2);
const option = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const symbols = option("--symbols", "SPY,TSLA,NVDA,AMZN,AAPL,GOOGL,MSFT,QQQ,SPCX,META").split(",");
const sizes = option("--sizes", "1000").split(",").map(Number);
const out = option("--out", "/tmp/vortex-stocks-quote-report.json");
if (sizes.some((n) => !Number.isFinite(n) || n < 50 || n > 10_000)) throw new Error("Sizes must be between R$50 and R$10,000");
if (symbols.length * sizes.length > 35) throw new Error("At most 35 buy quotes per run");
const tokens = symbols.map((s) => { const token = STOCK_TOKENS.find((t) => t.symbol === s); if (!token) throw new Error(`Not allowlisted: ${s}`); return token; });
const base = "https://www.vortexfinance.co/api/production/v1";
const fromToken = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const wallet = "0x000000000000000000000000000000000000dEaD";
const report = { at: new Date().toISOString(), kind: "READ_ONLY_QUOTE_SIMULATION", executed: false, targetBps: 50,
  route: "BRL Pix → Vortex Base USDC → LI.FI → Robinhood Chain Stock Token", rows: [], rampQuotes: [],
  limits: ["No Pix deposit, onchain execution or settlement tested", "Anonymous default Vortex pricing; partner pricing may differ", "FX is inferred from Vortex fee conversion, not an independent market benchmark", "First-buy ETH reserve is additional and not yet quoted by Vortex", "No claim about a buy/sell round trip follows from a one-way quote"] };
function save() { writeFileSync(out, JSON.stringify(report, null, 2) + "\n"); }
async function json(url, init = {}) {
  const response = await fetch(url, { ...init, headers: { accept: "application/json", ...init.headers }, signal: AbortSignal.timeout(45_000) });
  const body = await response.json();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${String(body.message || body.error || JSON.stringify(body)).slice(0, 200)}`);
  const remaining = response.headers.get("ratelimit-remaining");
  if (remaining != null && Number(remaining) < 3) throw new Error("Public API rate limit nearly exhausted; stop and resume later");
  return body;
}
async function reference(token) {
  const body = await json(`https://api.robinhood.com/rhj/prices/${token.symbol}`);
  const price = body.quotes?.find((q) => q.tokenSymbol === token.symbol);
  if (!price || price.isTradingHalt || !price.deployments.some((d) => d.chainId === 4663 && d.contractAddress.toLowerCase() === token.address.toLowerCase())) throw new Error("Invalid issuer price or trading halt");
  const bid = Number(price.tokenBid), ask = Number(price.tokenAsk);
  if (!(bid > 0 && ask >= bid)) throw new Error("Missing token-adjusted bid/ask; do not silently use underlying price");
  // tokenBid/tokenAsk already include corporate-action multipliers; never multiply them again.
  return { tokenAddress: token.address, source: "Robinhood RHJ tokenBid/tokenAsk midpoint", usd: (bid + ask) / 2, bid, ask, updatedAt: Date.parse(price.generatedAt) };
}
async function lifi(token, amount, sell = false) {
  const params = new URLSearchParams({ fromChain: sell ? "4663" : "8453", toChain: sell ? "8453" : "4663", fromToken: sell ? token.address : fromToken, toToken: sell ? fromToken : token.address, fromAmount: amount, fromAddress: wallet, toAddress: wallet, slippage: "0.005" });
  const q = await json(`https://li.quest/v1/quote?${params}`);
  return { tool: q.tool, action: q.action, estimate: q.estimate, quotedAt: new Date().toISOString() };
}
try { report.robinhoodAvailability = await json(`${base}/supported-cryptocurrencies?network=robinhood`); }
catch (error) { report.robinhoodAvailability = { error: error.message }; }
for (const amount of sizes) {
  const ramp = await json(`${base}/quotes`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rampType: "BUY", from: "pix", to: "base", inputAmount: String(amount), inputCurrency: "BRL", outputCurrency: "USDC", paymentMethod: "pix", countryCode: "BR", network: "base" }) });
  report.rampQuotes.push(ramp);
  for (const token of tokens) {
    const row = { symbol: token.symbol, brl: amount, tokenAddress: token.address, rampQuoteId: ramp.id };
    try {
      const before = await reference(token);
      const route = await lifi(token, parseUnits(ramp.outputAmount, 6).toString());
      const after = await reference(token);
      Object.assign(row, { referenceBefore: before, referenceAfter: after, route });
      if (Math.abs(after.usd / before.usd - 1) > 0.0002) throw new Error("Reference moved more than 2 bps during quote; repeat before judging cost");
      if (token.symbol === "NVDA") {
        try { row.reverseRoute = await lifi(token, route.estimate.toAmount, true); }
        catch (error) { row.reverseError = error.message; }
      }
      row.analysis = analyzeBuy({ ramp, route, reference: after });
      console.log(`${token.symbol} R$${amount}: estimate ${row.analysis.quotedCostBps.toFixed(2)} bps; minimum ${row.analysis.minimumCostBps.toFixed(2)} bps; explicit fees ${row.analysis.itemizedCostBps.toFixed(2)} bps (${route.tool})`);
    } catch (error) { row.error = error.message; console.log(`${token.symbol} R$${amount}: ${row.error}`); }
    report.rows.push(row); save();
  }
}
report.finishedAt = new Date().toISOString(); save();
console.log(`Saved ${report.rows.length} observations to ${out}; no transactions executed.`);
