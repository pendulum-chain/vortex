import Big from "big.js";
import {
  formatCodeTable,
  formatCostBps,
  formatPolicySummary,
  type RebalancePolicySummary
} from "../usdc-brla-usdc-base/notifications.ts";

interface BrlaToUsdcBaseCompletionMessageParams {
  brlaIntermediate: Big;
  cost: Big;
  policy?: RebalancePolicySummary;
  usdcIn: Big;
  usdcOut: Big;
}

export function formatBrlaToUsdcBaseCompletionMessage(params: BrlaToUsdcBaseCompletionMessageParams): string {
  return [
    "✅ *Base rebalancer completed (Main Nabla → BRLA Nabla)*",
    "USDC → BRLA (Main Nabla) → USDC (BRLA Nabla)",
    "",
    "*Rebalance summary*",
    formatCodeTable([
      ["Route", "Main Nabla + BRLA Nabla"],
      ["USDC in", `${params.usdcIn.toFixed(6)} USDC`],
      ["BRLA intermediate", `${params.brlaIntermediate.toFixed(6)} BRLA`],
      ["USDC out", `${params.usdcOut.toFixed(6)} USDC`],
      ["Net USDC cost", `${params.cost.toFixed(6)} USDC`],
      ["Cost/input", formatCostBps(params.cost, params.usdcIn)]
    ]),
    "",
    "*Policy bounds*",
    formatPolicySummary(params.policy)
  ].join("\n");
}
