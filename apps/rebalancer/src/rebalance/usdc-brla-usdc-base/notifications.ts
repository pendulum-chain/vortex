import Big from "big.js";
import type { WinningRoute } from "../../services/stateManager.ts";

interface BaseRebalanceCompletionMessageParams {
  brlaReceived: Big;
  cost: Big;
  finalUsdcBalance: Big;
  initialUsdcBalance: Big;
  requestedUsdc: Big;
  route: WinningRoute;
}

export function formatBaseRebalanceCompletionMessage(params: BaseRebalanceCompletionMessageParams): string {
  const costPercent = params.requestedUsdc.gt(0) ? params.cost.div(params.requestedUsdc).mul(100).toFixed(2) : "N/A";

  return [
    "✅ *Base rebalancer completed*",
    "USDC -> BRLA -> USDC on Base",
    "",
    "*Execution*",
    `- 🛣️ Route selected: \`${formatRoute(params.route)}\``,
    `- 💵 Requested amount: \`${params.requestedUsdc.toFixed(6)} USDC\``,
    `- 🪙 BRLA after Nabla swap: \`${params.brlaReceived.toFixed(6)} BRLA\``,
    "",
    "*Balance impact*",
    `- 🏦 Base USDC balance: \`${params.initialUsdcBalance.toFixed(6)} -> ${params.finalUsdcBalance.toFixed(6)} USDC\``,
    `- 📉 Net USDC cost: \`${params.cost.toFixed(6)} USDC\``,
    `- 📊 Cost/requested amount: \`${costPercent === "N/A" ? costPercent : `${costPercent}%`}\``
  ].join("\n");
}

function formatRoute(route: WinningRoute): string {
  if (route === "avenia") return "Avenia";
  if (route === "squidrouter") return "SquidRouter";
  return "Unknown";
}
