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
  // gasReserveTopUp sends the ETH gas reserve after the tokens: still "deliver".
  gasReserveTopUp: "deliver", relayBridge: "buy", uniswapApprove: "buy", uniswapSwap: "buy",
});

// In a sell the token leaves the wallet first: funding, the permit and the swap legs are the "sell" step.
const SELL_OVERRIDES = Object.freeze({
  initial: "sell", fundEphemeral: "sell", stockPermitTransfer: "sell",
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

// The status response reports a compliance hold in place of brlaOnrampMint, and the mint can still fail
// after minutes: until it is done, nothing says the Pix was received.
const PIX_UNCONFIRMED = Object.freeze(["initial", "brlaOnrampMint", "onHoldForComplianceCheck"]);

/** The waiting screen's copy, claiming only what the phase shows. */
export function waitingCopyPt(direction, phase, symbol) {
  if (direction === "SELL") {
    return { title: stepFor("SELL", phase) >= SELL_STEPS.indexOf("payout") ? "Seu Pix está a caminho" : "Vendendo seus tokens", text: "Você pode fechar esta tela: a venda continua e aparece no Início e no Histórico." };
  }
  return {
    title: !phase || PIX_UNCONFIRMED.includes(phase) ? "Confirmando seu Pix" : `Seus tokens ${symbol} estão a caminho`,
    text: phase === "onHoldForComplianceCheck" ? "Seu Pix está em verificação de conformidade, o que pode levar mais tempo. Você pode fechar esta tela e acompanhar pelo Início e pelo Histórico." : "Você pode fechar esta tela: a compra continua e aparece no Início e no Histórico.",
  };
}

// ProcessingSteps labels, one per step before "done".
export const STEP_LABELS_PT = Object.freeze({
  BUY: Object.freeze({ payment: "Pix recebido", convert: "Convertendo para dólar digital", buy: "Comprando seu token", deliver: "Enviando para sua carteira" }),
  SELL: Object.freeze({ sell: "Vendendo seus tokens", convert: "Convertendo para reais", payout: "Enviando seu Pix" }),
});
