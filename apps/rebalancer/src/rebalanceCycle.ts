import Big from "big.js";
import { type RebalancingPolicyMode, wouldExceedUsdcPoolCoverage } from "./rebalance/usdc-brla-usdc-base/guards.ts";
import { BrlaToUsdcBaseRebalancePhase, UsdcBaseRebalancePhase } from "./services/stateManager.ts";

export interface InFlightResumeDeps {
  forceRestart: boolean;
  mode: RebalancingPolicyMode;
  getUsdcBaseState: () => Promise<{ currentPhase: UsdcBaseRebalancePhase } | undefined>;
  getBrlaToUsdcState: () => Promise<{ currentPhase: BrlaToUsdcBaseRebalancePhase } | undefined>;
  resumeUsdcBase: () => Promise<unknown>;
  resumeBrlaToUsdc: () => Promise<unknown>;
}

// A run that died mid-flow holds funds in transit. It must be resumed, or in dry-run left paused,
// before any fresh quote, sizing, or balance check: those assume the in-flight USDC is still in the wallet.
export async function resumeInFlightRebalance(deps: InFlightResumeDeps): Promise<boolean> {
  if (deps.forceRestart) return false;

  const usdcBaseState = await deps.getUsdcBaseState();
  if (usdcBaseState && usdcBaseState.currentPhase !== UsdcBaseRebalancePhase.Idle) {
    if (deps.mode === "dry-run") {
      console.log(
        `Dry-run mode: USDC->BRLA->USDC run paused at phase ${usdcBaseState.currentPhase}. Skipping fresh evaluation.`
      );
      return true;
    }
    await deps.resumeUsdcBase();
    return true;
  }

  const brlaToUsdcState = await deps.getBrlaToUsdcState();
  if (brlaToUsdcState && brlaToUsdcState.currentPhase !== BrlaToUsdcBaseRebalancePhase.Idle) {
    if (deps.mode === "dry-run") {
      console.log(`Dry-run mode: BRLA->USDC run paused at phase ${brlaToUsdcState.currentPhase}. Skipping fresh evaluation.`);
      return true;
    }
    await deps.resumeBrlaToUsdc();
    return true;
  }

  return false;
}

export interface ProfitableAmountQuoteDeps {
  mode: RebalancingPolicyMode;
  standardAmountRaw: string;
  profitableAmountRaw: string;
  getBaseUsdcRaw: () => Promise<string>;
}

// Off mode never touches the chain, and a profitable amount the wallet cannot fund would only
// burn a second SquidRouter quote before failing the balance check.
export async function shouldQuoteProfitableAmount(deps: ProfitableAmountQuoteDeps): Promise<boolean> {
  if (deps.mode === "off") return false;
  if (deps.profitableAmountRaw === deps.standardAmountRaw) return false;

  const baseUsdcRaw = await deps.getBaseUsdcRaw();
  if (Big(baseUsdcRaw).lt(deps.profitableAmountRaw)) {
    console.log(
      `Base USDC balance ${toUsdc(baseUsdcRaw)} USDC cannot fund the profitable amount ${toUsdc(deps.profitableAmountRaw)} USDC. ` +
        `Using standard amount ${toUsdc(deps.standardAmountRaw)} USDC.`
    );
    return false;
  }

  return true;
}

function toUsdc(raw: string): string {
  return Big(raw).div(1e6).toFixed(6);
}

export interface UsdcPoolCoverageCapDeps {
  maxCoverage: number | undefined;
  readUsdcPool: () => Promise<{ reserveRaw: string; liabilitiesRaw: string }>;
}

// Checked before quoting: the pool's own coverage cap reverts the quote and would crash the run.
// A failed pool read throws, so an unreadable pool never bypasses the cap.
export async function exceedsUsdcPoolCoverageCap(amountUsdcRaw: string, deps: UsdcPoolCoverageCapDeps): Promise<boolean> {
  if (deps.maxCoverage === undefined) return false;

  const pool = await deps.readUsdcPool();
  if (!wouldExceedUsdcPoolCoverage(pool, amountUsdcRaw, deps.maxCoverage)) return false;

  console.log(
    `Base Nabla USDC pool reserve ${toUsdc(pool.reserveRaw)} / liabilities ${toUsdc(pool.liabilitiesRaw)}: adding ` +
      `${toUsdc(amountUsdcRaw)} USDC would exceed REBALANCING_MAX_USDC_COVERAGE ${deps.maxCoverage}. Skipping this USDC->BRLA->USDC amount.`
  );
  return true;
}

export interface RebalanceCycleDeps {
  lowerBound: number;
  upperBound: number;
  readCoverage: () => Promise<{ brlaCoverageRatio: number } | null | undefined>;
  resumeInFlight: () => Promise<boolean>;
  tryOpportunisticUsdcToBrla: () => Promise<boolean>;
  isUsdcToBrlaCapped: () => Promise<boolean>;
  alertUsdcToBrlaCapped: (brlaCoverageRatio: number) => Promise<void>;
  runBrlaToUsdc: (deviationBps: number) => Promise<void>;
  runUsdcToBrla: (deviationBps: number) => Promise<void>;
}

export function calculateCoverageDeviationBps(coverageRatio: number, triggerBound: number): number {
  return Number(
    Big(Math.abs(coverageRatio - triggerBound))
      .mul(10_000)
      .toFixed(2)
  );
}

export async function runRebalanceCycle(deps: RebalanceCycleDeps): Promise<void> {
  const coverage = await deps.readCoverage();
  if (!coverage) throw new Error("Failed to fetch Base Nabla coverage ratio.");

  if (await deps.resumeInFlight()) return;

  const { lowerBound, upperBound } = deps;
  const ratio = coverage.brlaCoverageRatio;

  if (ratio >= lowerBound && ratio <= upperBound) {
    if (!(await deps.isUsdcToBrlaCapped()) && (await deps.tryOpportunisticUsdcToBrla())) return;
    console.log(`BRLA coverage ${ratio} in range [${lowerBound}, ${upperBound}]. No rebalancing needed.`);
    return;
  }

  if (ratio < lowerBound) {
    const deviationBps = calculateCoverageDeviationBps(ratio, lowerBound);
    console.log(`BRLA coverage ${ratio} < ${lowerBound}. Evaluating BRLA->USDC (${deviationBps} bps deviation).`);
    await deps.runBrlaToUsdc(deviationBps);
    return;
  }

  const deviationBps = calculateCoverageDeviationBps(ratio, upperBound);
  console.log(`BRLA coverage ${ratio} > ${upperBound}. Evaluating USDC->BRLA (${deviationBps} bps deviation).`);
  // Unlike an opportunistic skip, this leaves a real BRLA imbalance in place, so it must not stay silent.
  if (await deps.isUsdcToBrlaCapped()) {
    await deps.alertUsdcToBrlaCapped(ratio);
    return;
  }
  await deps.runUsdcToBrla(deviationBps);
}
