// Quote research only. Never used to execute a ramp or populate a customer quote.
const positive = (value, label) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`Invalid ${label}`);
  return number;
};
const nonNegative = (value, label) => {
  const number = Number(value);
  if (value == null || value === "" || !Number.isFinite(number) || number < 0) throw new Error(`Invalid ${label}`);
  return number;
};

export function fiatPerUsd(quote) {
  // An inference from Vortex's contemporaneous BRL/USD fee conversion, not an independent FX benchmark.
  for (const prefix of ["vortexFee", "processingFee", "totalFee"]) {
    const fiat = Number(quote[`${prefix}Fiat`]);
    const usd = Number(quote[`${prefix}Usd`]);
    if (fiat > 0 && usd > 0) return fiat / usd;
  }
  throw new Error("No contemporaneous FX conversion in Vortex quote");
}

export function validateReference(reference, now = Date.now()) {
  positive(reference.usd, "reference price");
  const updatedAt = Number(reference.updatedAt);
  if (!Number.isFinite(updatedAt) || updatedAt > now + 30_000 || now - updatedAt > 10 * 60_000) {
    throw new Error("Oracle reference is stale or invalid; no cost verdict");
  }
}

export function analyzeBuy({ ramp, route, reference, reserveUsd = 0, now = Date.now() }) {
  validateReference(reference, now);
  const brl = positive(ramp.inputAmount, "BRL input");
  if (ramp.rampType !== "BUY" || ramp.inputCurrency !== "BRL" || ramp.outputCurrency !== "USDC" || ramp.network !== "base") throw new Error("Wrong ramp route");
  if (route.action?.fromChainId !== 8453 || route.action?.toChainId !== 4663 || route.action?.fromToken?.symbol !== "USDC") throw new Error("Wrong LI.FI route");
  if (route.action.fromToken.address.toLowerCase() !== "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913") throw new Error("Wrong input token");
  if (route.action.toToken.address.toLowerCase() !== reference.tokenAddress.toLowerCase()) throw new Error("Wrong Stock Token");
  // Compare integers: no rounding mismatch between the ramp output and the next route's input.
  const [whole, fraction = ""] = String(ramp.outputAmount).split(".");
  if (fraction.length > 6 || BigInt(whole + fraction.padEnd(6, "0")) !== BigInt(route.estimate.fromAmount)) throw new Error("Route input does not match ramp output");
  const inputUsd = brl / fiatPerUsd(ramp);
  const decimals = positive(route.action.toToken.decimals, "token decimals");
  const tokens = positive(route.estimate.toAmount, "output amount") / 10 ** decimals;
  const minimumTokens = positive(route.estimate.toAmountMin, "minimum output") / 10 ** decimals;
  if (minimumTokens > tokens) throw new Error("Minimum exceeds estimated output");
  const fees = route.estimate.feeCosts || [];
  if (fees.some((fee) => typeof fee.included !== "boolean")) throw new Error("Unknown fee inclusion");
  const includedUsd = fees.filter((fee) => fee.included === true).reduce((sum, fee) => sum + nonNegative(fee.amountUSD, "included fee"), 0);
  const excludedUsd = fees.filter((fee) => fee.included === false).reduce((sum, fee) => sum + nonNegative(fee.amountUSD, "excluded fee"), 0);
  const sourceGasUsd = (route.estimate.gasCosts || []).reduce((sum, gas) => sum + nonNegative(gas.amountUSD, "gas cost"), 0);
  nonNegative(reserveUsd, "reserve");
  const rampFeeUsd = nonNegative(ramp.totalFeeUsd, "ramp fee");
  // Included fees are already reflected in toAmount. Add ONLY externally paid fees/gas/reserve.
  const extraUsd = sourceGasUsd + excludedUsd + reserveUsd;
  const quotedCostBps = (inputUsd - tokens * reference.usd + extraUsd) / inputUsd * 10_000;
  const minimumCostBps = (inputUsd - minimumTokens * reference.usd + extraUsd) / inputUsd * 10_000;
  const itemizedCostBps = (rampFeeUsd + includedUsd + extraUsd) / inputUsd * 10_000;
  return { brl, inputUsd, tokens, minimumTokens, referenceUsd: reference.usd, referenceUpdatedAt: new Date(reference.updatedAt).toISOString(),
    fxBrlPerUsd: fiatPerUsd(ramp), fxBasis: "Inferred from Vortex fee conversion; independent BRL/USD benchmark still required",
    quotedCostBps, minimumCostBps, itemizedCostBps, sourceGasUsd, reserveUsd,
    rampFeeUsd, lifiIncludedFeesUsd: includedUsd, externalFeesUsd: excludedUsd,
    routeTool: route.tool, targetBps: 50, targetMetAtEstimate: quotedCostBps <= 50,
    targetMetAtMinimum: minimumCostBps <= 50, executed: false };
}
