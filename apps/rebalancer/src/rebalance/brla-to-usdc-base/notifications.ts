import Big from "big.js";
import {
  formatCompactTable,
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
    "*Summary*",
    formatCompactTable(
      ["Route", "USDC in", "BRLA mid", "USDC out", "Cost", "Cost bps"],
      [
        [
          "Main+BRLA Nabla",
          params.usdcIn.toFixed(6),
          params.brlaIntermediate.toFixed(6),
          params.usdcOut.toFixed(6),
          params.cost.toFixed(6),
          formatCostBps(params.cost, params.usdcIn)
        ]
      ]
    ),
    formatPolicySummary(params.policy)
  ].join("\n");
}
