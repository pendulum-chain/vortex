import { afterEach, describe, expect, it } from "bun:test";
import { getPhaseProcessorMaxExecutionTimeMs, getSquidRouterPayTimeoutMs } from "./phase-processor-config";

const originalProcessorTimeout = process.env.PHASE_PROCESSOR_MAX_EXECUTION_TIME_MS;

describe("phase processor timeout configuration", () => {
  afterEach(() => {
    if (originalProcessorTimeout === undefined) {
      delete process.env.PHASE_PROCESSOR_MAX_EXECUTION_TIME_MS;
    } else {
      process.env.PHASE_PROCESSOR_MAX_EXECUTION_TIME_MS = originalProcessorTimeout;
    }
  });

  it("limits SquidRouterPay polling to 80% of the processor timeout", () => {
    process.env.PHASE_PROCESSOR_MAX_EXECUTION_TIME_MS = "1000";

    expect(getPhaseProcessorMaxExecutionTimeMs()).toBe(1000);
    expect(getSquidRouterPayTimeoutMs()).toBe(800);
  });
});
