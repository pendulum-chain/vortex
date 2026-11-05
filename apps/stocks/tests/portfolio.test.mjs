import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_ETH_WEI, DEMO_GAS_PRICE_WEI, DEMO_HOLDINGS, DEMO_RESERVE_DUST_WEI, createDemoHoldings, createRobinhoodClient, readPortfolio, tokenFlags, valuePortfolio } from "../src/lib/portfolio.js";
import { sellGasRequiredWei } from "../src/lib/gas-reserve.js";
import { SIM_GAS_RESERVE } from "../src/lib/simulated-ramp.js";
import { STOCK_TOKENS } from "../src/lib/stocks.js";
import { WALLET, jsonMemory } from "./helpers.mjs";

const WEI = 10n ** 18n;

/** A viem-like client whose multicall answers from a table keyed by "SYMBOL.functionName". */
function fakeClient(answers, calls = []) {
  const bySymbol = new Map(STOCK_TOKENS.map((token) => [token.address, token.symbol]));
  return {
    chain: { contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } } },
    async multicall({ contracts, allowFailure }) {
      calls.push({ contracts, allowFailure });
      return contracts.map((contract) => {
        const key = contract.functionName === "getEthBalance" ? "ETH" : `${bySymbol.get(contract.address)}.${contract.functionName}`;
        return key in answers ? { status: "success", result: answers[key] } : { status: "failure", error: new Error("reverted") };
      });
    },
  };
}

const allSucceed = () => Object.fromEntries(STOCK_TOKENS.flatMap((token) => [[`${token.symbol}.balanceOf`, 0n], [`${token.symbol}.uiMultiplier`, WEI], [`${token.symbol}.paused`, false], [`${token.symbol}.oraclePaused`, false]]).concat([["ETH", 5n]]));

test("one multicall reads 4 values per token plus the ETH balance, failures allowed", async () => {
  const calls = [];
  const answers = { ...allSucceed(), "NVDA.balanceOf": 2n * WEI, "NVDA.uiMultiplier": 1000775159164630595n, "META.oraclePaused": true };
  const read = await readPortfolio({ client: fakeClient(answers, calls), owner: WALLET, now: () => 42 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].allowFailure, true);
  assert.equal(calls[0].contracts.length, 12 * 4 + 1);
  assert.equal(calls[0].contracts.at(-1).functionName, "getEthBalance");
  assert.equal(read.readAt, 42);
  assert.equal(read.ethWei, 5n);
  const nvda = read.positions.find((position) => position.symbol === "NVDA");
  assert.deepEqual(nvda, { symbol: "NVDA", address: "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC", raw: 2n * WEI, multiplierWei: 1000775159164630595n, paused: false, oraclePaused: false });
  assert.equal(tokenFlags(read).META.paused, true, "oraclePaused disables trading");
  assert.equal(tokenFlags(read).SPY.paused, false);
});

test("even one failed balance rejects the snapshot so the hook retains last good holdings as stale", async () => {
  const answers = allSucceed();
  delete answers["SPY.balanceOf"];
  delete answers.ETH;
  await assert.rejects(readPortfolio({ client: fakeClient(answers), owner: WALLET }), /Saldo indisponível agora/);
  await assert.rejects(readPortfolio({ client: fakeClient({}), owner: WALLET }), /Saldo indisponível agora/);
  await assert.rejects(readPortfolio({ client: fakeClient(allSucceed()), owner: "not-an-address" }));
});

test("valuation: tokens x token price, shares via the multiplier, value-weighted 24 h change", () => {
  const read = { readAt: 1, ethWei: 0n, failed: [], positions: [
    { symbol: "SPY", raw: WEI, multiplierWei: 1001717991187472003n, paused: false, oraclePaused: false },
    { symbol: "NVDA", raw: 2n * WEI, multiplierWei: null, paused: false, oraclePaused: true },
    { symbol: "AAPL", raw: WEI / 2n, multiplierWei: WEI, paused: false, oraclePaused: false },
    { symbol: "TSLA", raw: 0n, multiplierWei: WEI, paused: false, oraclePaused: false },
  ] };
  const prices = { SPY: { brl: 4000, change24hPct: 1 }, NVDA: { brl: 1000, change24hPct: -2 } };
  const view = valuePortfolio({ read, prices });
  assert.equal(view.status, "ok");
  assert.deepEqual(view.holdings.map((holding) => holding.symbol), ["SPY", "NVDA", "AAPL"]);
  assert.equal(view.totalBrl, 6000);
  assert.equal(view.unpricedCount, 1);
  const aapl = view.holdings.find((holding) => holding.symbol === "AAPL");
  assert.equal(aapl.valueBrl, null, "no price: value unknown, tokens still listed");
  const nvda = view.holdings.find((holding) => holding.symbol === "NVDA");
  assert.equal(nvda.multiplierWei, 1000775159164630595n, "the snapshot fills a failed multiplier read");
  assert.equal(nvda.sharesWei, 2001550318329261190n);
  assert.equal(nvda.paused, true);
  const before = 4000 / 1.01 + 2000 / 0.98;
  assert.ok(Math.abs(view.change24hPct - ((6000 - before) / before) * 100) < 1e-9);
  assert.equal(valuePortfolio({ read: { ...read, positions: [] }, prices }).status, "empty");
  assert.equal(valuePortfolio({ read, prices: {} }).change24hPct, null);
});

test("demo holdings start illustrative, move on simulated success and never go negative", () => {
  const { storage } = jsonMemory();
  const holdings = createDemoHoldings({ storage });
  assert.deepEqual({ ...DEMO_HOLDINGS }, { SPY: "0.35", NVDA: "1.2", AAPL: "0.8" });
  assert.equal(holdings.balanceOf("NVDA"), 1_200000000000000000n);
  holdings.apply({ direction: "BUY", symbol: "NVDA", tokenAmountWei: 300000000000000000n });
  assert.equal(holdings.balanceOf("NVDA"), 1_500000000000000000n);
  holdings.apply({ direction: "SELL", symbol: "SPY", tokenAmountWei: WEI });
  assert.equal(holdings.balanceOf("SPY"), 0n);
  holdings.apply({ direction: "BUY", symbol: "NOPE", tokenAmountWei: WEI });
  let read = holdings.read();
  assert.equal(read.ethWei, DEMO_ETH_WEI);
  assert.equal(DEMO_ETH_WEI, 10_000_000_000_000n, "below the 0.00002 ETH reserve threshold: the first demo buy tops it up");
  holdings.apply({ direction: "BUY", symbol: "SPY", tokenAmountWei: WEI, gasReserveWei: 40_000_000_000_000n });
  holdings.apply({ direction: "SELL", symbol: "SPY", tokenAmountWei: WEI, gasReserveWei: 40_000_000_000_000n });
  assert.equal(holdings.ethWei(), 50_000_000_000_000n, "a buy's reserve arrives; a sell never adds ETH");
  read = holdings.read();
  assert.equal(read.ethWei, 50_000_000_000_000n);
  assert.equal(read.positions.length, 12);
  assert.equal(read.positions.find((position) => position.symbol === "NVDA").raw, 1_500000000000000000n);
  assert.equal(createDemoHoldings({ storage }).balanceOf("NVDA"), 1_500000000000000000n, "survives a reload (sessionStorage)");
  assert.equal(createDemoHoldings({ storage }).ethWei(), 50_000_000_000_000n, "the ETH too");
  holdings.setEthWei(DEMO_RESERVE_DUST_WEI);
  assert.equal(holdings.ethWei(), DEMO_RESERVE_DUST_WEI, "the sell-reserve-used deep link spends the reserve down to dust");
  assert.equal(holdings.balanceOf("NVDA"), 1_500000000000000000n, "the tokens stay");
  holdings.reset();
  assert.equal(holdings.balanceOf("NVDA"), 1_200000000000000000n);
  assert.equal(holdings.ethWei(), DEMO_ETH_WEI);
});

test("demo gas: the reserve pays a sell at the chain's floor; the deep link's dust does not", () => {
  assert.equal(DEMO_GAS_PRICE_WEI, 20_000_000n, "0.02 gwei, Robinhood Chain's minimum base fee");
  const required = sellGasRequiredWei(DEMO_GAS_PRICE_WEI);
  assert.ok(DEMO_ETH_WEI >= required, "the demo wallet's 0.00001 ETH covers a sell");
  assert.ok(DEMO_RESERVE_DUST_WEI < required, "0.000001 ETH does not");
  assert.ok(DEMO_RESERVE_DUST_WEI < SIM_GAS_RESERVE.thresholdWei, "so the next demo buy tops the reserve up");
});

test("the chain client targets Robinhood Chain and honours the RPC override", () => {
  const publicRpc = createRobinhoodClient();
  assert.equal(publicRpc.chain.id, 4663);
  assert.equal(publicRpc.transport.url, "https://rpc.mainnet.chain.robinhood.com");
  const override = createRobinhoodClient({ rpcOverride: "https://rpc.example/restricted" });
  assert.equal(override.transport.url, "https://rpc.example/restricted");
});
