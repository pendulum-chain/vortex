import assert from "node:assert/strict";
import test from "node:test";
import { formatNextOpenBrasilia, marketBadgePt, usMarketStatus } from "../src/lib/market-hours.js";
import { sourceLinePt, updatedAgoPt } from "../src/lib/market.js";
import { dividendsLinePt, formatMultiplier, formatSharesApproxPt, formatTokenAmount, formatTokensPt, sharesWei } from "../src/lib/token.js";
import { findStock, isinLabelPt } from "../src/lib/stocks.js";

const WEI = 10n ** 18n;

test("token amounts use pt-BR separators and are floored", () => {
  assert.equal(formatTokenAmount("1234.56789"), "1.234,5678");
  assert.equal(formatTokenAmount("0.489899999"), "0,4898");
  assert.equal(formatTokenAmount("1234567.5", { dp: 2 }), "1.234.567,50");
  assert.equal(formatTokenAmount("2.5000", { trim: true }), "2,5");
  assert.equal(formatTokenAmount("3", { trim: true }), "3");
});

test("token and share counts agree in number the pt-BR way", () => {
  assert.equal(formatTokensPt(489899999999999999n), "0,4898 token");
  assert.equal(formatTokensPt(WEI + WEI / 2n), "1,5000 token");
  assert.equal(formatTokensPt(2n * WEI), "2,0000 tokens");
  assert.equal(formatTokensPt(0n), "0 tokens");
  assert.equal(formatTokensPt(1n), "< 0,0001 token");
  assert.equal(formatSharesApproxPt(sharesWei(489899999999999999n, 1000775159164630595n)), "≈ 0,4902 ação");
  assert.equal(formatSharesApproxPt(3n * WEI), "≈ 3,0000 ações");
});

test("the multiplier line rounds (it is a ratio, not a sellable amount)", () => {
  assert.equal(formatMultiplier(1000775159164630595n), "1,0008");
  assert.equal(formatMultiplier(1005101770003214918n), "1,0051");
  assert.equal(formatMultiplier(WEI), "1,0000");
});

test("the next US open is shown in Brasília time", () => {
  // Saturday: Monday 09:30 EDT = 10:30 in Brasília.
  const saturday = new Date("2026-09-26T14:00:00Z");
  const status = usMarketStatus(saturday);
  assert.equal(formatNextOpenBrasilia(status.nextOpen), "seg 10:30 (Brasília)");
  assert.equal(marketBadgePt(status, saturday), "Bolsa dos EUA fechada · abre seg 10:30 (Brasília)");
  // After the November DST change 09:30 EST is 11:30 in Brasília; "hoje"/"amanhã" when close.
  const preMarket = new Date("2026-11-02T12:00:00Z");
  assert.equal(formatNextOpenBrasilia(usMarketStatus(preMarket).nextOpen, { now: preMarket }), "hoje 11:30 (Brasília)");
  const thanksgiving = new Date("2026-11-26T15:00:00Z");
  assert.equal(marketBadgePt(usMarketStatus(thanksgiving), thanksgiving), "Bolsa dos EUA fechada · abre amanhã 11:30 (Brasília)");
  assert.equal(marketBadgePt(usMarketStatus(new Date("2026-09-28T14:00:00Z"))), "Bolsa dos EUA aberta");
});

test("price lines name their source and age", () => {
  const savedAt = Date.parse("2026-09-26T17:05:00Z");
  assert.equal(sourceLinePt({ source: "coingecko", savedAt }), "Fonte: CoinGecko · atualizado 14:05");
  assert.equal(sourceLinePt({ source: "demo", savedAt }), "Valores ilustrativos (ambiente de teste)");
  assert.equal(updatedAgoPt(savedAt, savedAt + 30_000), "atualizado agora");
  assert.equal(updatedAgoPt(savedAt, savedAt + 3 * 60_000), "atualizado há 3 min");
  assert.equal(updatedAgoPt(savedAt, savedAt + 125 * 60_000), "atualizado há 2 h");
});

test("the KYC form shows CPF and CEP the Brazilian way while typing (the value stays digits)", async () => {
  const { formatCepInput, formatCpfInput } = await import("../src/format.js");
  assert.equal(formatCpfInput("12345678901"), "123.456.789-01");
  assert.equal(formatCpfInput("123.456.789-01"), "123.456.789-01", "idempotent");
  assert.equal(formatCpfInput("1234"), "123.4");
  assert.equal(formatCpfInput("1234567"), "123.456.7");
  assert.equal(formatCpfInput("1234567890"), "123.456.789-0");
  assert.equal(formatCpfInput("123456789012345"), "123.456.789-01", "at most 11 digits");
  assert.equal(formatCpfInput(""), "");
  assert.equal(formatCepInput("01310100"), "01310-100");
  assert.equal(formatCepInput("01310"), "01310");
  assert.equal(formatCepInput("013101"), "01310-1");
  assert.equal(formatCepInput("01310-100"), "01310-100", "idempotent");
});

test("the portfolio total is \"—\" while unknown, never \"R$ 0,00\" for a wallet with tokens", async () => {
  const { portfolioTotalPt } = await import("../src/format.js");
  const holding = (valueBrl) => ({ symbol: "NVDA", valueBrl });
  assert.equal(portfolioTotalPt(null), "—", "no balance read yet (first Robinhood Chain read failed)");
  assert.equal(portfolioTotalPt({ holdings: [holding(null), holding(null)], totalBrl: 0, unpricedCount: 2 }), "—", "no price for any holding");
  assert.equal(portfolioTotalPt({ holdings: [holding(100), holding(null)], totalBrl: 100, unpricedCount: 1 }).replace(/\s/g, " "), "R$ 100,00");
  assert.equal(portfolioTotalPt({ holdings: [], totalBrl: 0, unpricedCount: 0 }).replace(/\s/g, " "), "R$ 0,00", "an empty wallet really is zero");
});

test("the rights card never says \"um pouco mais que uma ação (1,0000)\" and labels the ISIN as the tracked asset's", () => {
  const one = dividendsLinePt(WEI);
  assert.match(one, /Hoje, 1 token = 1 ação/);
  assert.doesNotMatch(one, /1,0000|multiplicador/);
  assert.equal(dividendsLinePt(BigInt(findStock("TSLA").multiplierSnapshot.replace(".", ""))), one, "TSLA's snapshot is exactly 1");
  assert.match(dividendsLinePt(1005101770003214918n), /um pouco mais que uma ação \(multiplicador atual 1,0051\)/);
  assert.match(dividendsLinePt(null), /passa a representar um pouco mais que uma ação\.$/);
  assert.equal(isinLabelPt(findStock("NVDA")), "ISIN da ação acompanhada");
  assert.equal(isinLabelPt(findStock("SPY")), "ISIN do fundo acompanhado");
});
