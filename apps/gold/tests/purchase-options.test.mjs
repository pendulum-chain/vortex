import test from 'node:test';
import assert from 'node:assert/strict';
import { MIN_BUY, DEFAULT_BUY, QUICK_BUY_VALUES, validBuyAmount, buyFeePercent } from '../src/lib/purchase-options.js';

test('R$50 is the minimum, default and first quick choice', () => {
  assert.equal(MIN_BUY, 50);
  assert.equal(DEFAULT_BUY, 50);
  assert.deepEqual(QUICK_BUY_VALUES, [50, 250, 500]);
  for (const value of QUICK_BUY_VALUES) assert.equal(validBuyAmount(value), true);
});
test('purchase amount boundaries reject invalid and subminimum input', () => {
  for (const value of ['', '0', '-50', '49', '49.99', '50.5', 'NaN', 'Infinity']) assert.equal(validBuyAmount(value), false);
  assert.equal(validBuyAmount('50'), true);
  assert.equal(validBuyAmount('1000'), true);
});
test('small-buy fees use the quote, not a hardcoded example', () => {
  assert.ok(Math.abs(buyFeePercent({totalFee:10.74},50) - 21.48) < 0.0001);
  assert.equal(buyFeePercent({networkFee:5,serviceFee:1},50),12);
  assert.equal(buyFeePercent({totalFee:10},0),null);
});
