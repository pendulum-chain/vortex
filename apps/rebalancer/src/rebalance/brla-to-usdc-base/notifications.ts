import Big from "big.js";

interface BrlaToUsdcBaseCompletionMessageParams {
  brlaIn: Big;
  brlaOut: Big;
  cost: Big;
  usdcIntermediate: Big;
}

export function formatBrlaToUsdcBaseCompletionMessage(params: BrlaToUsdcBaseCompletionMessageParams): string {
  const costPercent = params.brlaIn.gt(0) ? params.cost.div(params.brlaIn).mul(100).toFixed(2) : "N/A";

  return [
    "\u2705 *Base rebalancer completed (BRLA Nabla \u2192 Main Nabla)*",
    "BRLA \u2192 USDC (BRLA Nabla) \u2192 BRLA (Main Nabla)",
    "",
    "*Execution*",
    "- \uD83D\uDEE3\uFE0F Route: BRLA Nabla + Main Nabla",
    `- \uD83D\uDCB5 Requested amount: \`${params.brlaIn.toFixed(6)} BRLA\``,
    `- \uD83E\uDD9A USDC intermediate: \`${params.usdcIntermediate.toFixed(6)} USDC\``,
    `- \uD83E\uDD9A BRLA out: \`${params.brlaOut.toFixed(6)} BRLA\``,
    "",
    "*Cost*",
    `- \uD83D\uDCC9 Net BRLA cost: \`${params.cost.toFixed(6)} BRLA\``,
    `- \uD83D\uDCCA Cost/requested amount: \`${costPercent === "N/A" ? costPercent : `${costPercent}%`}\``
  ].join("\n");
}
