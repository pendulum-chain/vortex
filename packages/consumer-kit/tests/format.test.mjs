import assert from "node:assert/strict";
import test from "node:test";
import { formatBRL, formatChange, formatNumber, formatPercent, shortAddress } from "../src/format.js";

const NBSP = " ";
const MINUS = "−";

test("formats reais the way Gold does (Intl puts a no-break space after R$)", () => {
  assert.equal(formatBRL(1234.5), `R$${NBSP}1.234,50`);
  assert.equal(formatBRL(0), `R$${NBSP}0,00`);
  assert.equal(formatBRL(1234.567, 0), `R$${NBSP}1.235`);
  assert.equal(formatNumber(0.48989, 4), "0,4899");
});

test("percentages carry an explicit sign and a true minus", () => {
  assert.equal(formatPercent(1.24), "+1,24%");
  assert.equal(formatPercent(-0.52), `${MINUS}0,52%`);
  assert.equal(formatPercent(0), "0,00%");
  assert.equal(formatPercent(-0.001), "0,00%");
  assert.equal(formatPercent(3.5, { signed: false }), "3,50%");
  assert.equal(formatPercent(-3.5, { signed: false }), `${MINUS}3,50%`);
  assert.equal(formatPercent(0.815, { digits: 1 }), "+0,8%");
  assert.equal(formatPercent(null), "—");
  assert.equal(formatPercent(Number.NaN), "—");
});

test("changes show an arrow and a sign, never colour alone", () => {
  assert.equal(formatChange(1.24), "▲ +1,24%");
  assert.equal(formatChange(-0.52), `▼ ${MINUS}0,52%`);
  assert.equal(formatChange(0), "0,00%");
  assert.equal(formatChange(undefined), "—");
});

test("short wallet addresses", () => {
  assert.equal(shortAddress("0x71c2F3a68790eAd79216dBE733fb83aF089C93a4"), "0x71c2…93a4");
  assert.equal(shortAddress(null), "Preparando…");
});
