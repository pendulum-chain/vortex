// Ramp phase -> progress step. Steps only ever advance: an unknown or earlier phase keeps the
// current step. Gold's regex (/swap|destination|transfer|complete/) is not reused because
// "nablaSwap" matches it too early.

export const BUY_STEPS = Object.freeze(["payment", "convert", "buy", "deliver", "done"]);
export const SELL_STEPS = Object.freeze(["sell", "convert", "payout", "done"]);

export const PHASE_TO_STEP = Object.freeze({
  // Real RampPhase names (packages/shared/src/endpoints/ramp.endpoints.ts; tests/phases.test.mjs reads it).
  initial: "payment", brlaOnrampMint: "payment", fundEphemeral: "convert", subsidizePreSwap: "convert", nablaApprove: "convert",
  nablaSwap: "convert", distributeFees: "convert", subsidizePostSwap: "convert", squidRouterApprove: "buy", squidRouterSwap: "buy",
  squidRouterPay: "buy", finalSettlementSubsidy: "deliver", destinationTransfer: "deliver", brlaPayoutOnBase: "payout", complete: "done",
  // Future phases pending API confirmation: Vortex has to announce the real names.
  // gasReserveTopUp sends the ETH gas reserve after the tokens: still "deliver".
  lifiApprove: "buy", lifiSwap: "buy", lifiPermitExecute: "buy", gasReserveTopUp: "deliver",
  relayBridge: "buy", uniswapApprove: "buy", uniswapSwap: "buy",
});

export const ASSUMED_PHASES = Object.freeze(["lifiApprove", "lifiSwap", "lifiPermitExecute", "gasReserveTopUp", "relayBridge"]);

// In a sell the token leaves the wallet first: the swap legs are the "sell" step.
const SELL_OVERRIDES = Object.freeze({
  initial: "sell", lifiApprove: "sell", lifiSwap: "sell", lifiPermitExecute: "sell",
  relayBridge: "sell", uniswapApprove: "sell", uniswapSwap: "sell",
  squidRouterApprove: "sell", squidRouterSwap: "sell", squidRouterPay: "sell",
});

export function stepsFor(direction) {
  return direction === "SELL" ? SELL_STEPS : BUY_STEPS;
}

/** stepFor(direction, phase, previousIndex) -> step index; never goes backwards. */
export function stepFor(direction, phase, previousIndex = 0) {
  const steps = stepsFor(direction);
  const step = (direction === "SELL" ? SELL_OVERRIDES[phase] : undefined) ?? PHASE_TO_STEP[phase];
  const index = step ? steps.indexOf(step) : -1;
  return index > previousIndex ? index : previousIndex;
}

// ProcessingSteps labels (spec S7/S8), one per step before "done".
export const STEP_LABELS_PT = Object.freeze({
  BUY: Object.freeze({ payment: "Pix recebido", convert: "Convertendo para dólar digital", buy: "Comprando seu token", deliver: "Enviando para sua carteira" }),
  SELL: Object.freeze({ sell: "Vendendo seus tokens", convert: "Convertendo para reais", payout: "Enviando seu Pix" }),
});
