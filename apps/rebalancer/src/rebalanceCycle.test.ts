import { describe, expect, mock, test } from "bun:test";
import type { RebalancingPolicyMode } from "./rebalance/usdc-brla-usdc-base/guards.ts";
import {
  calculateCoverageDeviationBps,
  type InFlightResumeDeps,
  type RebalanceCycleDeps,
  resumeInFlightRebalance,
  runRebalanceCycle,
  shouldQuoteProfitableAmount
} from "./rebalanceCycle.ts";
import { BrlaToUsdcBaseRebalancePhase, UsdcBaseRebalancePhase } from "./services/stateManager.ts";

const idleUsdc = { currentPhase: UsdcBaseRebalancePhase.Idle };
const stuckUsdc = { currentPhase: UsdcBaseRebalancePhase.SquidRouterApproveAndSwap };
const idleBrla = { currentPhase: BrlaToUsdcBaseRebalancePhase.Idle };
const stuckBrla = { currentPhase: BrlaToUsdcBaseRebalancePhase.NablaSwapBrlaToUsdc };

function resumeDeps(overrides: Partial<InFlightResumeDeps> = {}) {
  return {
    forceRestart: false,
    getBrlaToUsdcState: mock(async (): Promise<{ currentPhase: BrlaToUsdcBaseRebalancePhase } | undefined> => idleBrla),
    getUsdcBaseState: mock(async (): Promise<{ currentPhase: UsdcBaseRebalancePhase } | undefined> => idleUsdc),
    mode: "auto" as RebalancingPolicyMode,
    resumeBrlaToUsdc: mock(async () => {}),
    resumeUsdcBase: mock(async () => {}),
    ...overrides
  };
}

describe("resumeInFlightRebalance", () => {
  test("resumes a stuck USDC->BRLA->USDC run before anything fresh", async () => {
    const deps = resumeDeps({ getUsdcBaseState: mock(async () => stuckUsdc) });

    expect(await resumeInFlightRebalance(deps)).toBe(true);
    expect(deps.resumeUsdcBase).toHaveBeenCalledTimes(1);
    expect(deps.getBrlaToUsdcState).not.toHaveBeenCalled();
  });

  test("resumes a stuck BRLA->USDC run when the other flow is idle", async () => {
    const deps = resumeDeps({ getBrlaToUsdcState: mock(async () => stuckBrla) });

    expect(await resumeInFlightRebalance(deps)).toBe(true);
    expect(deps.resumeBrlaToUsdc).toHaveBeenCalledTimes(1);
    expect(deps.resumeUsdcBase).not.toHaveBeenCalled();
  });

  test("reports nothing to resume when both flows are idle or missing", async () => {
    const deps = resumeDeps({ getUsdcBaseState: mock(async () => undefined) });

    expect(await resumeInFlightRebalance(deps)).toBe(false);
    expect(deps.resumeUsdcBase).not.toHaveBeenCalled();
    expect(deps.resumeBrlaToUsdc).not.toHaveBeenCalled();
  });

  test("dry-run leaves a stuck run paused and still ends the cycle", async () => {
    const stuckFlows: Partial<InFlightResumeDeps>[] = [
      { getUsdcBaseState: mock(async () => stuckUsdc) },
      { getBrlaToUsdcState: mock(async () => stuckBrla) }
    ];

    for (const stuckFlow of stuckFlows) {
      const deps = resumeDeps({ mode: "dry-run", ...stuckFlow });

      expect(await resumeInFlightRebalance(deps)).toBe(true);
      expect(deps.resumeUsdcBase).not.toHaveBeenCalled();
      expect(deps.resumeBrlaToUsdc).not.toHaveBeenCalled();
    }
  });

  test("--restart bypasses resumption without reading state", async () => {
    const deps = resumeDeps({ forceRestart: true, getUsdcBaseState: mock(async () => stuckUsdc) });

    expect(await resumeInFlightRebalance(deps)).toBe(false);
    expect(deps.getUsdcBaseState).not.toHaveBeenCalled();
    expect(deps.resumeUsdcBase).not.toHaveBeenCalled();
  });
});

function cycleDeps(calls: string[], overrides: Partial<RebalanceCycleDeps> = {}) {
  return {
    lowerBound: 0.99,
    readCoverage: mock(async () => {
      calls.push("coverage");
      return { brlaCoverageRatio: 1 };
    }),
    resumeInFlight: mock(async () => {
      calls.push("resume");
      return false;
    }),
    runBrlaToUsdc: mock(async (_deviationBps: number) => {
      calls.push("brlaToUsdc");
    }),
    runUsdcToBrla: mock(async (_deviationBps: number) => {
      calls.push("usdcToBrla");
    }),
    tryOpportunisticUsdcToBrla: mock(async () => {
      calls.push("opportunistic");
      return false;
    }),
    upperBound: 1.01,
    ...overrides
  };
}

describe("runRebalanceCycle", () => {
  test("reads coverage first and stops after resuming an in-flight run", async () => {
    const calls: string[] = [];
    const deps = cycleDeps(calls, {
      resumeInFlight: mock(async () => {
        calls.push("resume");
        return true;
      })
    });

    await runRebalanceCycle(deps);

    expect(calls).toEqual(["coverage", "resume"]);
  });

  test("does not resume when coverage is unavailable", async () => {
    const calls: string[] = [];
    const deps = cycleDeps(calls, { readCoverage: mock(async () => null) });

    await expect(runRebalanceCycle(deps)).rejects.toThrow("Failed to fetch Base Nabla coverage ratio.");
    expect(deps.resumeInFlight).not.toHaveBeenCalled();
  });

  test("evaluates the opportunistic path only after nothing was resumed", async () => {
    const calls: string[] = [];

    await runRebalanceCycle(cycleDeps(calls));

    expect(calls).toEqual(["coverage", "resume", "opportunistic"]);
  });

  test("routes low coverage to BRLA->USDC with the deviation in bps", async () => {
    const calls: string[] = [];
    const deps = cycleDeps(calls, { readCoverage: mock(async () => ({ brlaCoverageRatio: 0.98 })) });

    await runRebalanceCycle(deps);

    expect(deps.runBrlaToUsdc).toHaveBeenCalledWith(100);
    expect(deps.tryOpportunisticUsdcToBrla).not.toHaveBeenCalled();
    expect(calls).toEqual(["resume", "brlaToUsdc"]);
  });

  test("routes high coverage to USDC->BRLA with the deviation in bps", async () => {
    const calls: string[] = [];
    const deps = cycleDeps(calls, { readCoverage: mock(async () => ({ brlaCoverageRatio: 1.02 })) });

    await runRebalanceCycle(deps);

    expect(deps.runUsdcToBrla).toHaveBeenCalledWith(100);
    expect(calls).toEqual(["resume", "usdcToBrla"]);
  });

  test("measures the deviation from the crossed bound", () => {
    expect(calculateCoverageDeviationBps(1.0738, 1.01)).toBe(638);
  });
});

describe("shouldQuoteProfitableAmount", () => {
  const amounts = { profitableAmountRaw: "2000000000", standardAmountRaw: "1000000000" };

  test("off mode never reads the wallet balance", async () => {
    const getBaseUsdcRaw = mock(async () => "5000000000");

    expect(await shouldQuoteProfitableAmount({ ...amounts, getBaseUsdcRaw, mode: "off" })).toBe(false);
    expect(getBaseUsdcRaw).not.toHaveBeenCalled();
  });

  test("skips a profitable amount equal to the standard amount without reading the balance", async () => {
    const getBaseUsdcRaw = mock(async () => "5000000000");

    expect(
      await shouldQuoteProfitableAmount({ ...amounts, getBaseUsdcRaw, mode: "auto", profitableAmountRaw: "1000000000" })
    ).toBe(false);
    expect(getBaseUsdcRaw).not.toHaveBeenCalled();
  });

  test("falls back to the standard amount when the balance cannot fund the profitable amount", async () => {
    const getBaseUsdcRaw = mock(async () => "1032947559");

    expect(await shouldQuoteProfitableAmount({ ...amounts, getBaseUsdcRaw, mode: "auto" })).toBe(false);
  });

  test("quotes the profitable amount when the balance covers it", async () => {
    const getBaseUsdcRaw = mock(async () => "2500000000");

    expect(await shouldQuoteProfitableAmount({ ...amounts, getBaseUsdcRaw, mode: "auto" })).toBe(true);
  });
});
