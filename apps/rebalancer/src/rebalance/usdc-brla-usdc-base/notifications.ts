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
    "*Summary*",
    formatCompactTable(
      ["Route", "Req USDC", "BRLA out", "Start", "Final", "Cost", "Cost bps"],
      [
        [
          formatRoute(params.route),
          params.requestedUsdc.toFixed(6),
          params.brlaReceived.toFixed(6),
          params.initialUsdcBalance.toFixed(6),
          params.finalUsdcBalance.toFixed(6),
          params.cost.toFixed(6),
          formatCostBps(params.cost, params.requestedUsdc)
        ]
      ]
    ),
    formatPolicySummary(params.policy)
  ].join("\n");
}

export function formatPolicySummary(policy: RebalancePolicySummary | undefined): string {
  if (!policy) return "```Policy decision unavailable (resumed or manual execution).```";

  const decision = policy.decision;
  const decisionRow = decision
    ? [
        policy.config.mode,
        decision.shouldExecute ? "execute" : "skip",
        decision.band,
        policy.deviationBps === undefined ? "N/A" : formatBps(policy.deviationBps),
        formatBps(decision.costBps),
        formatBps(decision.allowedCostBps),
        formatBps(policy.config.hardMaxCostBps)
      ]
    : [policy.config.mode, "unavailable", "N/A", "N/A", "N/A", "N/A", formatBps(policy.config.hardMaxCostBps)];

  return [
    "*Policy*",
    formatCompactTable(["Mode", "Decision", "Band", "Dev bps", "Cost bps", "Cap bps", "Hard bps"], [decisionRow]),
    `Bands bps: mod>=${formatBps(policy.config.moderateDeviationBps)} severe>=${formatBps(policy.config.severeDeviationBps)} | caps bps: mild<=${formatBps(policy.config.maxCostBpsMild)} mod<=${formatBps(policy.config.maxCostBpsModerate)} severe<=${formatBps(policy.config.maxCostBpsSevere)}`
  ].join("\n");
}

export function formatCompactTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((header, index) => Math.max(header.length, ...rows.map(row => row[index]?.length ?? 0)));
  const formatRow = (row: string[]) =>
    row
      .map((cell, index) => cell.padEnd(widths[index] ?? cell.length))
      .join("  ")
      .trimEnd();
  return ["```", formatRow(headers), ...rows.map(formatRow), "```"].join("\n");
}

export function formatCostBps(cost: Big, denominator: Big): string {
  if (denominator.lte(0)) return "N/A";
  return cost.div(denominator).mul(10_000).toFixed(2);
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
