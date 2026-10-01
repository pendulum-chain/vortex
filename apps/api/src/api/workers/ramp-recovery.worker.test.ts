import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { EPaymentMethod, Networks, RampDirection } from "@vortexfi/shared";
import { Op } from "sequelize";
import logger from "../../config/logger";
import { config } from "../../config/vars";
import RampState from "../../models/rampState.model";
import phaseProcessor from "../services/phases/phase-processor";
import rampService from "../services/ramp/ramp.service";
import RampRecoveryWorker from "./ramp-recovery.worker";

const originalFindAll = RampState.findAll;
const originalProcessRamp = phaseProcessor.processRamp;
const processRamp = mock(async () => undefined);

beforeEach(() => {
  RampState.findAll = mock(async () => [
    {
      currentPhase: "brlaOnrampMint",
      from: EPaymentMethod.PIX,
      id: "moonbeam-ramp",
      state: { flow: { id: "BrlOnrampAssethubUsdc" } },
      to: Networks.AssetHub,
      unsignedTxs: []
    }
  ]) as unknown as typeof RampState.findAll;
  phaseProcessor.processRamp = processRamp;
  processRamp.mockClear();
});

afterEach(() => {
  RampState.findAll = originalFindAll;
  phaseProcessor.processRamp = originalProcessRamp;
});

describe("RampRecoveryWorker Moonbeam retirement", () => {
  it("does not report or invoke automatic recovery for Moonbeam-dependent ramps", async () => {
    const worker = new RampRecoveryWorker("*/5 * * * *", false) as unknown as { recover: () => Promise<void> };

    await worker.recover();

    expect(processRamp).not.toHaveBeenCalled();
  });
});

describe("RampRecoveryWorker funded SELL start", () => {
  const originalRecoverFundedSellRamp = rampService.recoverFundedSellRamp;
  const originalAppendErrorLog = rampService.appendErrorLog;
  const recoverFundedSellRamp = mock(async (_rampId: string): Promise<unknown> => undefined);
  const appendErrorLog = mock(async (_id: string, _entry: unknown) => undefined);
  const fundedSell = {
    currentPhase: "initial",
    from: Networks.Ethereum,
    id: "funded-sell-ramp",
    state: { flow: { id: "BrlOfframpBase" }, squidRouterSwapHash: "0xabc" },
    to: EPaymentMethod.PIX,
    unsignedTxs: []
  };
  let queries: Array<{ where: Record<PropertyKey, unknown> }>;

  beforeEach(() => {
    queries = [];
    RampState.findAll = mock(async (options: { where: Record<PropertyKey, unknown> }) => {
      queries.push(options);
      return options.where.currentPhase === "initial" ? [fundedSell] : [];
    }) as unknown as typeof RampState.findAll;
    rampService.recoverFundedSellRamp = recoverFundedSellRamp as unknown as typeof rampService.recoverFundedSellRamp;
    rampService.appendErrorLog = appendErrorLog as unknown as typeof rampService.appendErrorLog;
    recoverFundedSellRamp.mockReset();
    recoverFundedSellRamp.mockImplementation(async () => undefined);
    appendErrorLog.mockClear();
  });

  afterEach(() => {
    rampService.recoverFundedSellRamp = originalRecoverFundedSellRamp;
    rampService.appendErrorLog = originalAppendErrorLog;
  });

  async function runWorker() {
    const worker = new RampRecoveryWorker("*/5 * * * *", false) as unknown as { recover: () => Promise<void> };
    await worker.recover();
  }

  it("selects initial SELL ramps with a reported source hash between 16 minutes and 3 days old", async () => {
    const before = Date.now();
    await runWorker();
    const after = Date.now();

    const where = queries.find(query => query.where.currentPhase === "initial")?.where as Record<PropertyKey, unknown>;
    expect(where.type).toBe(RampDirection.SELL);
    expect(where.flowVariant).toBe(config.flowVariant);
    expect(where[Op.or]).toEqual([
      { "state.squidRouterSwapHash": { [Op.ne]: null } },
      { "state.squidRouterNoPermitTransferHash": { [Op.ne]: null } }
    ]);
    const createdAt = where.createdAt as Record<symbol, Date>;
    const minute = 60 * 1000;
    // The worker reads the clock between `before` and `after`, so each cutoff lies in that window.
    expect(createdAt[Op.lt].getTime()).toBeGreaterThanOrEqual(before - 16 * minute);
    expect(createdAt[Op.lt].getTime()).toBeLessThanOrEqual(after - 16 * minute);
    expect(createdAt[Op.gt].getTime()).toBeGreaterThanOrEqual(before - 3 * 24 * 60 * minute);
    expect(createdAt[Op.gt].getTime()).toBeLessThanOrEqual(after - 3 * 24 * 60 * minute);
  });

  it("starts each selected ramp through the funded SELL path, not the phase processor", async () => {
    await runWorker();

    expect(recoverFundedSellRamp).toHaveBeenCalledTimes(1);
    expect(recoverFundedSellRamp).toHaveBeenCalledWith("funded-sell-ramp");
    expect(processRamp).not.toHaveBeenCalled();
    expect(appendErrorLog).not.toHaveBeenCalled();
  });

  it("logs a failed start on the ramp and selects it again on the next cycle", async () => {
    recoverFundedSellRamp.mockImplementation(async () => {
      throw new Error("database unavailable");
    });

    const info = spyOn(logger, "info");
    await runWorker();
    await runWorker();

    expect(info).toHaveBeenCalledWith("Ramp recovery attempt completed. Successful: 0, Failed: 1");
    info.mockRestore();
    expect(appendErrorLog).toHaveBeenCalledTimes(2);
    expect(appendErrorLog.mock.calls[0]?.[0]).toBe("funded-sell-ramp");
    expect(appendErrorLog.mock.calls[0]?.[1]).toMatchObject({ error: "database unavailable", phase: "initial" });
    expect(recoverFundedSellRamp).toHaveBeenCalledTimes(2);
  });
});
