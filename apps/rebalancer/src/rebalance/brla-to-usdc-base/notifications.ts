import Big from "big.js";

interface BrlaToUsdcBaseCompletionMessageParams {
  brlaIntermediate: Big;
  cost: Big;
  usdcIn: Big;
  usdcOut: Big;
}

export function formatBrlaToUsdcBaseCompletionMessage(params: BrlaToUsdcBaseCompletionMessageParams): string {
  const costPercent = params.usdcIn.gt(0) ? params.cost.div(params.usdcIn).mul(100).toFixed(2) : "N/A";

  return [
    "\u2705 *Base rebalancer completed (Main Nabla \u2192 BRLA Nabla)*",
    "USDC \u2192 BRLA (Main Nabla) \u2192 USDC (BRLA Nabla)",
    "",
    "*Execution*",
    "- \uD83D\uDEE3\uFE0F Route: Main Nabla + BRLA Nabla",
    `- \uD83D\uDCB5 USDC in: \`${params.usdcIn.toFixed(6)} USDC\``,
    `- \uD83E\uDD9A BRLA intermediate: \`${params.brlaIntermediate.toFixed(6)} BRLA\``,
    `- \uD83D\uDCB5 USDC out: \`${params.usdcOut.toFixed(6)} USDC\``,
    "",
    "*Cost*",
    `- \uD83D\uDCC9 Net USDC cost: \`${params.cost.toFixed(6)} USDC\``,
    `- \uD83D\uDCCA Cost/input: \`${costPercent === "N/A" ? costPercent : `${costPercent}%`}\``
  ].join("\n");
}
