import Big from "big.js";
import type { WinningRoute } from "../../services/stateManager.ts";
import type { RebalancingCostPolicyConfig, RebalancingCostPolicyDecision } from "./guards.ts";

export interface RebalancePolicySummary {
  config: RebalancingCostPolicyConfig;
  decision?: RebalancingCostPolicyDecision;
  deviationBps?: number;
}

interface BaseRebalanceCompletionMessageParams {
  brlaReceived: Big;
  cost: Big;
  finalUsdcBalance: Big;
  initialUsdcBalance: Big;
  policy?: RebalancePolicySummary;
  requestedUsdc: Big;
  route: WinningRoute;
}

export function formatBaseRebalanceCompletionMessage(params: BaseRebalanceCompletionMessageParams): string {
  return [
    "✅ *Base rebalancer completed*",
    "USDC -> BRLA -> USDC on Base",
    "",
    "*Rebalance summary*",
    formatCodeTable([
      ["Route", formatRoute(params.route)],
      ["Requested", `${params.requestedUsdc.toFixed(6)} USDC`],
      ["BRLA received", `${params.brlaReceived.toFixed(6)} BRLA`],
      ["Start balance", `${params.initialUsdcBalance.toFixed(6)} USDC`],
      ["Final balance", `${params.finalUsdcBalance.toFixed(6)} USDC`],
      ["Net USDC cost", `${params.cost.toFixed(6)} USDC`],
      ["Cost/requested", formatCostBps(params.cost, params.requestedUsdc)]
    ]),
    "",
    "*Policy bounds*",
    formatPolicySummary(params.policy)
  ].join("\n");
}

export function formatPolicySummary(policy: RebalancePolicySummary | undefined): string {
  if (!policy) return "```Policy decision unavailable (resumed or manual execution).```";

  const decisionRows: [string, string][] = policy.decision
    ? [
        ["Decision", policy.decision.shouldExecute ? "execute" : "skip"],
        ["Band", policy.decision.band],
        ["Deviation", policy.deviationBps === undefined ? "N/A" : `${formatBps(policy.deviationBps)} bps`],
        ["Projected cost", `${formatBps(policy.decision.costBps)} bps`],
        ["Allowed for band", `${formatBps(policy.decision.allowedCostBps)} bps`]
      ]
    : [["Decision", "unavailable"]];

  const rows: [string, string][] = [
    ["Mode", policy.config.mode],
    ...decisionRows,
    ["Moderate starts", `${formatBps(policy.config.moderateDeviationBps)} bps`],
    ["Severe starts", `${formatBps(policy.config.severeDeviationBps)} bps`],
    ["Mild max cost", `${formatBps(policy.config.maxCostBpsMild)} bps`],
    ["Moderate max cost", `${formatBps(policy.config.maxCostBpsModerate)} bps`],
    ["Severe max cost", `${formatBps(policy.config.maxCostBpsSevere)} bps`],
    ["Hard max cost", `${formatBps(policy.config.hardMaxCostBps)} bps`]
  ];

  return formatCodeTable(rows);
}

export function formatCodeTable(rows: [string, string][]): string {
  const labelWidth = Math.max(...rows.map(([label]) => label.length));
  const formattedRows = rows.map(([label, value]) => `${label.padEnd(labelWidth)}  ${value}`);
  return ["```", ...formattedRows, "```"].join("\n");
}

export function formatCostBps(cost: Big, denominator: Big): string {
  if (denominator.lte(0)) return "N/A";
  return `${cost.div(denominator).mul(10_000).toFixed(2)} bps`;
}

function formatBps(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function formatRoute(route: WinningRoute): string {
  if (route === "avenia") return "Avenia";
  if (route === "squidrouter") return "SquidRouter";
  if (route === "nabla-main") return "Main Nabla";
  return "Unknown";
}
