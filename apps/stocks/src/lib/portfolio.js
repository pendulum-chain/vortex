// Balances on Robinhood Chain: ONE viem multicall (Multicall3 is deployed on 4663) through a plain http client, not the Privy provider, so showing a
// balance never switches the embedded wallet's chain. Tokens outside the allowlist are ignored.
import { robinhoodChain, rpcUrl, session, withRpcOverride } from "@vortexfi/consumer-kit";
import { createPublicClient, formatUnits, getAddress, http, parseAbi, parseUnits } from "viem";
import { STOCK_TOKENS, findStock } from "./stocks.js";
import { STOCKS_KEYS } from "./stores.js";
import { multiplierWeiFor, positionValueBrl, sharesWei } from "./token.js";

export const STOCK_TOKEN_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function uiMultiplier() view returns (uint256)",
  "function paused() view returns (bool)",
  "function oraclePaused() view returns (bool)",
  "function nonces(address) view returns (uint256)",
]);
export const MULTICALL3_ABI = parseAbi(["function getEthBalance(address) view returns (uint256)"]);

/** Public RPC by default (rate-limited, "not recommended for production"); an origin-restricted override. */
export function createRobinhoodClient({ rpcOverride = "" } = {}) {
  const chain = withRpcOverride(robinhoodChain, rpcOverride);
  return createPublicClient({ chain, transport: http(rpcUrl(chain), { timeout: 10_000, retryCount: 2 }) });
}

/** @typedef {{symbol:string, address:string, raw:bigint, multiplierWei:bigint|null, paused:boolean|null, oraclePaused:boolean|null}} Position */
/** @typedef {{readAt:number, ethWei:bigint|null, positions:Position[], failed:string[]}} PortfolioRead */

const READS_PER_TOKEN = ["balanceOf", "uiMultiplier", "paused", "oraclePaused"];

/**
 * One multicall: 4 reads per token + getEthBalance(owner) -> 12 x 4 + 1 = 49 calls, allowFailure.
 * Throws only when the call itself fails or every balance failed (the UI then shows rpc_error and
 * keeps the last good values greyed out).
 * @returns {Promise<PortfolioRead>} failed = symbols whose balanceOf failed
 */
export async function readPortfolio({ client, owner, tokens = STOCK_TOKENS, now = Date.now }) {
  const account = getAddress(owner);
  const contracts = tokens.flatMap((token) => READS_PER_TOKEN.map((functionName) => ({
    address: token.address, abi: STOCK_TOKEN_ABI, functionName, args: functionName === "balanceOf" ? [account] : [],
  })));
  contracts.push({ address: client.chain?.contracts?.multicall3?.address ?? robinhoodChain.contracts.multicall3.address, abi: MULTICALL3_ABI, functionName: "getEthBalance", args: [account] });
  const results = await client.multicall({ contracts, allowFailure: true });
  const value = (index) => (results[index]?.status === "success" ? results[index].result : null);
  const failed = [];
  const positions = tokens.map((token, tokenIndex) => {
    const base = tokenIndex * READS_PER_TOKEN.length;
    const raw = value(base);
    if (raw == null) failed.push(token.symbol);
    return {
      symbol: token.symbol, address: token.address, raw: raw == null ? 0n : BigInt(raw),
      multiplierWei: value(base + 1) == null ? null : BigInt(value(base + 1)),
      paused: value(base + 2) == null ? null : Boolean(value(base + 2)),
      oraclePaused: value(base + 3) == null ? null : Boolean(value(base + 3)),
    };
  });
  if (failed.length) throw new Error("Saldo indisponível agora. Tente novamente em instantes.");
  const eth = value(contracts.length - 1);
  return { readAt: now(), ethWei: eth == null ? null : BigInt(eth), positions, failed };
}

/** Raw balance of one token (the sell balance check right before registering). */
export async function readTokenBalance({ client, owner, token }) {
  return BigInt(await client.readContract({ address: token.address, abi: STOCK_TOKEN_ABI, functionName: "balanceOf", args: [getAddress(owner)] }));
}

/** Per symbol: {paused, multiplierWei} from a read, for detail screens and withIssuerPauses(). */
export function tokenFlags(read) {
  return Object.fromEntries((read?.positions ?? []).map((position) => [position.symbol, {
    paused: position.paused === true || position.oraclePaused === true ? true : (position.paused === false && position.oraclePaused === false ? false : null),
    multiplierWei: position.multiplierWei,
  }]));
}

/**
 * Values a read with display prices. Value = tokens x CoinGecko token price (the multiplier is
 * already priced in); "≈ ações" = sharesWei. The 24 h change is value-weighted over the priced
 * holdings; unpriced holdings stay listed with value null and are left out of the total.
 * @param {{read:PortfolioRead, prices:Record<string, {brl:number, change24hPct:number|null}>, tokens?:ReadonlyArray<object>}} args
 */
export function valuePortfolio({ read, prices = {}, tokens = STOCK_TOKENS }) {
  const bySymbol = new Map((read?.positions ?? []).map((position) => [position.symbol, position]));
  const holdings = [];
  for (const token of tokens) {
    const position = bySymbol.get(token.symbol);
    if (!position || position.raw <= 0n) continue;
    const multiplier = multiplierWeiFor(token, position.multiplierWei);
    const price = prices[token.symbol];
    holdings.push({
      symbol: token.symbol,
      token,
      raw: position.raw,
      tokenAmount: formatUnits(position.raw, 18),
      sharesWei: sharesWei(position.raw, multiplier),
      multiplierWei: multiplier,
      valueBrl: price ? positionValueBrl(position.raw, price.brl) : null,
      change24hPct: price && Number.isFinite(price.change24hPct) ? price.change24hPct : null,
      paused: position.paused === true || position.oraclePaused === true,
    });
  }
  const priced = holdings.filter((holding) => holding.valueBrl != null);
  const totalBrl = priced.reduce((sum, holding) => sum + holding.valueBrl, 0);
  const withChange = priced.filter((holding) => holding.change24hPct != null && holding.change24hPct > -100);
  const nowValue = withChange.reduce((sum, holding) => sum + holding.valueBrl, 0);
  const before = withChange.reduce((sum, holding) => sum + holding.valueBrl / (1 + holding.change24hPct / 100), 0);
  return {
    status: holdings.length ? "ok" : "empty",
    holdings,
    totalBrl,
    change24hPct: before > 0 ? ((nowValue - before) / before) * 100 : null,
    unpricedCount: holdings.length - priced.length,
    ethWei: read?.ethWei ?? null,
    failed: read?.failed ?? [],
  };
}

// Demo mode only: illustrative starting positions, updated by simulated buys and sells.
export const DEMO_HOLDINGS = Object.freeze({ SPY: "0.35", NVDA: "1.2", AAPL: "0.8" });
// Illustrative ETH on Robinhood Chain: what is left of an earlier purchase's gas reserve (0.00001
// ETH). The simulated sell spends none, so the sell review shows the fee paid from the reserve. It is
// below the reserve threshold (0.00002 ETH), so the first demo buy shows the reserve line and tops
// the wallet up; later buys do not. Stored with the positions under the "ETH" key.
export const DEMO_ETH_WEI = 10_000_000_000_000n;
// Demo only: the base fee is Robinhood Chain's floor, 0.02 gwei (ArbGasInfo.getMinimumGasPrice).
export const DEMO_GAS_PRICE_WEI = 20_000_000n;
// Demo deep link sell-reserve-used: what a used-up reserve leaves, 0.000001 ETH, below the ≈ 0.00000204
// ETH one sell needs at the floor (gas-reserve.js sellGasRequiredWei).
export const DEMO_RESERVE_DUST_WEI = 1_000_000_000_000n;
const ETH_KEY = "ETH";

/** Per-tab demo holdings (sessionStorage), shaped like readPortfolio() so the UI has one path. */
export function createDemoHoldings({ storage = session, key = STOCKS_KEYS.demoHoldings, initial = DEMO_HOLDINGS, initialEthWei = DEMO_ETH_WEI, now = Date.now } = {}) {
  const stored = () => {
    const value = storage.get(key, null);
    return value && typeof value === "object" ? value : null;
  };
  const load = () => {
    const source = stored() ?? Object.fromEntries(Object.entries(initial).map(([symbol, amount]) => [symbol, parseUnits(amount, 18).toString()]));
    return Object.fromEntries(Object.entries(source).filter(([symbol]) => findStock(symbol)).map(([symbol, wei]) => [symbol, BigInt(wei)]));
  };
  const loadEth = () => {
    const value = stored()?.[ETH_KEY];
    try { return value == null ? BigInt(initialEthWei) : BigInt(value); } catch { return BigInt(initialEthWei); }
  };
  const save = (balances, ethWei, applied = stored()?.applied || []) => storage.set(key, { ...Object.fromEntries(Object.entries(balances).map(([symbol, wei]) => [symbol, wei.toString()])), [ETH_KEY]: ethWei.toString(), ...(applied.length ? { applied } : {}) });
  return {
    balanceOf: (symbol) => load()[symbol] ?? 0n,
    hasApplied: (operationId) => (stored()?.applied || []).includes(operationId),
    ethWei: () => loadEth(),
    /** A simulated success: BUY credits the tokens and the gas reserve's ETH, SELL debits (never below zero). */
    apply({ direction, symbol, tokenAmountWei, gasReserveWei = 0n, operationId = null }) {
      if (!findStock(symbol)) return;
      if (operationId && (stored()?.applied || []).includes(operationId)) return;
      const balances = load();
      const amount = BigInt(tokenAmountWei);
      const current = balances[symbol] ?? 0n;
      balances[symbol] = direction === "SELL" ? (current > amount ? current - amount : 0n) : current + amount;
      const applied = operationId ? [...(stored()?.applied || []), operationId] : stored()?.applied || [];
      if (!save(balances, loadEth() + (direction === "BUY" ? BigInt(gasReserveWei) : 0n), applied)) throw new Error("Could not save simulated holdings.");
    },
    read(tokens = STOCK_TOKENS) {
      const balances = load();
      return {
        readAt: now(),
        ethWei: loadEth(),
        positions: tokens.map((token) => ({ symbol: token.symbol, address: token.address, raw: balances[token.symbol] ?? 0n, multiplierWei: null, paused: false, oraclePaused: false })),
        failed: [],
      };
    },
    /** Demo deep link only: the ETH left in the wallet (e.g. DEMO_RESERVE_DUST_WEI). */
    setEthWei: (ethWei) => save(load(), BigInt(ethWei)),
    reset: () => storage.remove(key),
  };
}
