#!/usr/bin/env node
// Anonymous listing/quote checks only. Never registers a ramp, logs in, signs or pays.
import { baseGoldRequest, validateBaseGoldQuote, BASE_PAXG } from "../src/lib/base-gold.js";
const index = process.argv.indexOf("--api");
const apiBase = index >= 0 ? process.argv[index + 1] : "https://api.vortexfinance.co";
const base = new URL(apiBase);
if (base.protocol !== "https:" && base.hostname !== "localhost" && base.hostname !== "127.0.0.1") throw new Error("Use HTTPS for a remote API.");
const checks = [];
const call = async (path, body) => {
  const r = await fetch(new URL(base.href.replace(/\/$/, "") + path), { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify({ ...body, api: true }) } : {}), signal: AbortSignal.timeout(25000) });
  const value = await r.json();
  if (!r.ok) throw Object.assign(new Error("API request refused"), { status: r.status, code: value.code });
  return value;
};
for (const method of ["pix", "usdc"]) {
  try {
    const response = await call(`/v1/supported-cryptocurrencies?network=base${method === "usdc" ? "&paymentMethod=usdc" : ""}`);
    const token = (response.cryptocurrencies || response.tokens || []).find(t => t.assetNetwork === "base" && t.assetSymbol === "PAXG" && t.assetDecimals === 18 && t.assetContractAddress.toLowerCase() === BASE_PAXG.address.toLowerCase());
    for (const direction of ["BUY", "SELL"]) {
      if (!token?.rampTypes?.includes(direction)) { checks.push({ method, direction, ready: false, reason: "canonical_token_not_listed" }); continue; }
      try {
        const request = baseGoldRequest({ direction, paymentMethod: method, amount: direction === "SELL" ? "0.005" : method === "pix" ? "50" : "10" });
        const q = validateBaseGoldQuote(await call("/v1/quotes", request), request);
        checks.push({ method, direction, ready: true, input: q.inputAmount, output: q.outputAmount, feeCurrency: q.feeCurrency, totalFee: q.totalFeeFiat, networkFee: q.networkFeeFiat, gasless: q.gasless === true });
      } catch (e) { checks.push({ method, direction, ready: false, reason: e.code || e.status || "quote_unavailable" }); }
    }
  } catch (e) { checks.push({ method, ready: false, reason: e.code || e.status || "listing_unavailable" }); }
}
const ready = checks.length === 4 && checks.every(c => c.ready);
console.log(JSON.stringify({ ready, chain: "base", contract: BASE_PAXG.address, checks, scope: "anonymous_quotes_only; settlement and real wallet authorization still require acceptance" }, null, 2));
if (!ready && !process.argv.includes("--allow-not-ready")) process.exitCode = 2;
