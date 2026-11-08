import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { BUY_STEPS, PHASE_TO_STEP, SELL_STEPS, STEP_LABELS_PT, stepFor, waitingCopyPt } from "../src/lib/phases.js";
import { SIM_PHASES } from "../src/lib/simulated-ramp.js";
import { REPO } from "./helpers.mjs";

// The real phase names, read from the shared wire contract (packages/shared/src/endpoints/ramp.endpoints.ts).
function sharedRampPhases() {
  const source = readFileSync(join(REPO, "packages/shared/src/endpoints/ramp.endpoints.ts"), "utf8");
  const union = /export type RampPhase =([\s\S]*?);/.exec(source)?.[1] ?? "";
  return new Set([...union.matchAll(/"([A-Za-z]+)"/g)].map((match) => match[1]));
}

test("every mapped phase exists in the shared RampPhase", () => {
  const phases = sharedRampPhases();
  assert.ok(phases.size > 30, "RampPhase union not found");
  for (const phase of Object.keys(PHASE_TO_STEP)) assert.ok(phases.has(phase), `${phase} is not a RampPhase`);
});

test("buy phases advance through the four steps to done", () => {
  assert.deepEqual([...BUY_STEPS], ["payment", "convert", "buy", "deliver", "done"]);
  let index = 0;
  const seen = [];
  for (const phase of ["initial", "brlaOnrampMint", "fundEphemeral", "nablaSwap", "uniswapSwap", "destinationTransfer", "complete"]) {
    index = stepFor("BUY", phase, index);
    seen.push(BUY_STEPS[index]);
  }
  assert.deepEqual(seen, ["payment", "payment", "convert", "convert", "buy", "deliver", "done"]);
  assert.equal(BUY_STEPS[stepFor("BUY", "gasReserveTopUp", 3)], "deliver", "the reserve top-up (after destinationTransfer) is still delivery");
});

test("sell phases: funding, the permit and the swap legs are the sell step", () => {
  assert.deepEqual([...SELL_STEPS], ["sell", "convert", "payout", "done"]);
  for (const phase of ["fundEphemeral", "stockPermitTransfer"]) assert.equal(SELL_STEPS[stepFor("SELL", phase, 0)], "sell", `${phase} must not show the sale as done`);
  assert.equal(SELL_STEPS[stepFor("SELL", "uniswapSwap", 0)], "sell");
  assert.equal(SELL_STEPS[stepFor("SELL", "relayBridge", 0)], "sell");
  assert.equal(SELL_STEPS[stepFor("SELL", "squidRouterSwap", 0)], "sell");
  assert.equal(SELL_STEPS[stepFor("SELL", "nablaSwap", 0)], "convert");
  assert.equal(SELL_STEPS[stepFor("SELL", "brlaPayoutOnBase", 1)], "payout");
  assert.equal(SELL_STEPS[stepFor("SELL", "complete", 2)], "done");
});

test("steps never move backwards and unknown phases keep the current step", () => {
  assert.equal(stepFor("BUY", "nablaSwap", 3), 3);
  assert.equal(stepFor("BUY", "somethingNew", 2), 2);
  assert.equal(stepFor("SELL", "somethingNew", 2), 2);
  assert.equal(stepFor("BUY", "brlaPayoutOnBase", 1), 1, "a sell-only step does not exist in a buy");
});

test("every simulated phase is mapped, so the demo progress bar moves", () => {
  for (const phase of SIM_PHASES.BUY) assert.ok(BUY_STEPS.includes(PHASE_TO_STEP[phase]), phase);
  let index = 0;
  for (const phase of SIM_PHASES.SELL) {
    const next = stepFor("SELL", phase, index);
    assert.ok(next >= index, phase);
    index = next;
  }
  assert.equal(SELL_STEPS[index], "done");
  assert.ok(SIM_PHASES.BUY.includes("relayBridge") && SIM_PHASES.BUY.includes("uniswapSwap"));
});

test("every step before done has a pt-BR label", () => {
  for (const step of BUY_STEPS.slice(0, -1)) assert.ok(STEP_LABELS_PT.BUY[step], step);
  for (const step of SELL_STEPS.slice(0, -1)) assert.ok(STEP_LABELS_PT.SELL[step], step);
});

test("a buy says its tokens are on the way only after the Pix is confirmed", () => {
  for (const phase of [undefined, "initial", "brlaOnrampMint", "onHoldForComplianceCheck"]) assert.equal(waitingCopyPt("BUY", phase, "NVDA").title, "Confirmando seu Pix", phase);
  for (const phase of ["fundEphemeral", "nablaSwap", "relayBridge", "destinationTransfer"]) assert.equal(waitingCopyPt("BUY", phase, "NVDA").title, "Seus tokens NVDA estão a caminho", phase);
  assert.match(waitingCopyPt("BUY", "onHoldForComplianceCheck", "NVDA").text, /verificação de conformidade, o que pode levar mais tempo/);
  assert.doesNotMatch(waitingCopyPt("BUY", "brlaOnrampMint", "NVDA").text, /conformidade/);
  // A ramp held past an hour no longer promises that it continues.
  const now = Date.parse("2026-11-08T12:00:00Z");
  for (const [direction, phase] of [["BUY", "relayBridge"], ["BUY", "brlaOnrampMint"], ["SELL", "uniswapSwap"], ["SELL", "brlaPayoutOnBase"]]) {
    const slow = waitingCopyPt(direction, phase, "NVDA", { createdAt: new Date(now - 61 * 60_000).toISOString(), now });
    assert.equal(slow.title, "Esta operação está demorando mais que o normal", phase);
    assert.match(slow.text, /Consulte o suporte com o código da operação/);
    assert.doesNotMatch(`${slow.title} ${slow.text}`, /a caminho|continua/);
    assert.equal(waitingCopyPt(direction, phase, "NVDA", { createdAt: new Date(now - 59 * 60_000).toISOString(), now }).text.includes("continua"), true, "within the hour, as before");
  }
  assert.match(waitingCopyPt("BUY", "onHoldForComplianceCheck", "NVDA", { createdAt: new Date(now - 3 * 60 * 60_000).toISOString(), now }).text, /conformidade/);
  assert.ok(sharedRampPhases().has("onHoldForComplianceCheck"), "the name the status response uses");
});

test("a sell says its Pix is on the way only from the payout step on", () => {
  for (const phase of [undefined, "initial", "fundEphemeral", "stockPermitTransfer", "uniswapSwap", "relayBridge", "nablaSwap"]) assert.equal(waitingCopyPt("SELL", phase).title, "Vendendo seus tokens", phase);
  assert.equal(waitingCopyPt("SELL", "brlaPayoutOnBase").title, "Seu Pix está a caminho");
  assert.equal(waitingCopyPt("SELL", "complete").title, "Seu Pix está a caminho");
});
