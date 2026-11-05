import assert from "node:assert/strict";
import test from "node:test";
import { localHistoryRows, mergeHistory, serverHistoryRows, ownedHistoryRows } from "../src/lib/history.js";

test("server history is invisible immediately after a direct DID or wallet switch", () => {
  const rows = [{ id: "A-private-history" }], snapshot = { owner: "did:A:walletA", rows };
  assert.deepEqual(ownedHistoryRows(snapshot, "did:A:walletA"), rows);
  assert.deepEqual(ownedHistoryRows(snapshot, "did:B:walletB"), []);
  assert.deepEqual(ownedHistoryRows(snapshot, "did:A:walletB"), []);
  assert.deepEqual(ownedHistoryRows(null, "did:B:walletB"), []);
  assert.deepEqual(mergeHistory([], ownedHistoryRows({ owner: "did:A:walletA", rows: null }, "did:A:walletA")), []);
});

const NVDA = "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC";

test("local history entries become rows; simulated ones stay labelled", () => {
  const rows = localHistoryRows([
    { rampId: "sim-r-2", walletAddress: "0xabc", rampType: "SELL", symbol: "NVDA", brlAmount: "581.2", tokenAmount: "0.5", explorerLink: null, simulated: true, completedAt: 2000 },
    { rampId: "r-1", walletAddress: "0xabc", rampType: "BUY", symbol: "SPY", brlAmount: "500", tokenAmount: "0.124", explorerLink: "https://x/tx/1", completedAt: 1000 },
    { walletAddress: "0xabc", rampType: "BUY" },
  ]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { id: "sim-r-2", direction: "SELL", symbol: "NVDA", brlAmount: 581.2, tokenAmount: "0.5", date: 2000, status: "success", simulated: true, explorerLink: null });
  assert.equal(rows[1].simulated, false);
});

test("server history keeps only this network and resolves the token by address", () => {
  const response = { totalCount: 3, transactions: [
    { id: "a", type: "BUY", from: "pix", to: "robinhood", fromAmount: "500", toAmount: "0.4261", fromCurrency: "BRL", toCurrency: NVDA, status: "COMPLETE", currentPhase: "complete", date: "2026-09-26T12:00:00Z", externalTxExplorerLink: "https://robinhoodchain.blockscout.com/tx/0x1" },
    { id: "b", type: "SELL", from: "robinhood", to: "pix", fromAmount: "0.1", toAmount: "110.5", fromCurrency: NVDA, toCurrency: "BRL", status: "FAILED", currentPhase: "failed", date: "2026-09-25T12:00:00Z" },
    { id: "gold", type: "BUY", from: "pix", to: "ethereum", fromAmount: "100", toAmount: "0.01", toCurrency: "PAXG", status: "COMPLETE", currentPhase: "complete", date: "2026-09-24T12:00:00Z" },
  ] };
  const rows = serverHistoryRows(response, "robinhood");
  assert.deepEqual(rows.map((row) => [row.id, row.direction, row.symbol, row.status]), [["a", "BUY", "NVDA", "success"], ["b", "SELL", "NVDA", "failure"]]);
  assert.equal(rows[0].brlAmount, 500);
  assert.equal(rows[1].tokenAmount, "0.1");
  assert.deepEqual(serverHistoryRows(null, "robinhood"), []);
});

test("merge by id: the server status wins, the list is newest first", () => {
  const local = [{ id: "a", direction: "BUY", symbol: "NVDA", brlAmount: 500, tokenAmount: "0.4", date: 1000, status: "success", simulated: false, explorerLink: null }];
  const server = [
    { id: "a", direction: "BUY", symbol: null, brlAmount: 500, tokenAmount: "0.4261", date: 1500, status: "success", simulated: false, explorerLink: "https://x" },
    { id: "c", direction: "SELL", symbol: "SPY", brlAmount: 90, tokenAmount: "0.02", date: 3000, status: "processing", simulated: false, explorerLink: null },
  ];
  const merged = mergeHistory(local, server);
  assert.deepEqual(merged.map((row) => row.id), ["c", "a"]);
  assert.equal(merged[1].symbol, "NVDA", "a server row without a known token keeps the local symbol");
  assert.equal(merged[1].explorerLink, "https://x");
});

test("merge keeps the local explorer link and amounts when the server row has none", () => {
  const link = "https://robinhoodchain.blockscout.com/tx/0xab";
  const local = [{ id: "a", direction: "BUY", symbol: "NVDA", brlAmount: 500, tokenAmount: "0.4", date: 1000, status: "success", simulated: false, explorerLink: link }];
  const [server] = serverHistoryRows({ transactions: [{ id: "a", type: "BUY", from: "pix", to: "robinhood", fromAmount: "500", toAmount: "", fromCurrency: "BRL", toCurrency: "unknown", status: "COMPLETE", currentPhase: "complete", date: "2026-09-26T10:00:00Z" }] }, "robinhood");
  assert.equal(server.explorerLink, null);
  const [merged] = mergeHistory(local, [server]);
  assert.equal(merged.explorerLink, link);
  assert.equal(merged.symbol, "NVDA");
  assert.equal(merged.tokenAmount, "0.4", "a missing server amount keeps the local one");
  assert.equal(merged.date, Date.parse("2026-09-26T10:00:00Z"), "the server's values still win");
  const [serverOnly] = mergeHistory([], [server]);
  assert.equal(serverOnly.explorerLink, null, "a server-only row keeps every field");
});
