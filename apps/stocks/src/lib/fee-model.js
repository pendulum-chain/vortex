// Illustrative direct-routing costs: round placeholders, not any provider's rates. Vortex is the only
// own revenue fee; Stocks adds no markup. Real quotes always use the server's pricing and provider data.
export const SIM_FEES = Object.freeze({ fixed: 1, vortexRate: 0.001, nablaRate: 0.001, relayRate: 0.001, swapRate: 0.001, productRate: 0, network: 1 });

const cents = (value) => Math.round(value * 100) / 100;

export function simulatedProviderCosts(amountBrl) {
  return [
    { id: "ramp", provider: "avenia", amountFiat: SIM_FEES.fixed, includedIn: "fees" },
    { id: "conversion", provider: "nabla", amountFiat: cents(amountBrl * SIM_FEES.nablaRate), includedIn: "fees" },
    { id: "bridge", provider: "relay", amountFiat: cents(amountBrl * SIM_FEES.relayRate), includedIn: "fees" },
    { id: "swap", provider: "uniswap", amountFiat: cents(amountBrl * SIM_FEES.swapRate), includedIn: "fees" },
    { id: "vortex", provider: "vortex", amountFiat: cents(amountBrl * SIM_FEES.vortexRate), includedIn: "fees" },
    { id: "network", provider: "network", amountFiat: SIM_FEES.network, includedIn: "fees" },
  ];
}

export function simulatedFees(amountBrl) {
  const service = cents(simulatedProviderCosts(amountBrl).filter((cost) => cost.id !== "network").reduce((sum, cost) => sum + cost.amountFiat, 0));
  const network = SIM_FEES.network;
  return { network, service, total: cents(service + network), currency: "BRL" };
}
