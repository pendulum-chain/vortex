import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { ApiManager, RampDirection } from "@vortexfi/shared";
import type RampState from "../../../../models/rampState.model";
import { MoonbeamPostProcessHandler } from "./moonbeam-post-process-handler";

const originalGetInstance = ApiManager.getInstance;
const getInstance = mock(() => {
  throw new Error("Moonbeam cleanup must not initialize ApiManager");
});

beforeEach(() => {
  ApiManager.getInstance = getInstance as typeof ApiManager.getInstance;
  getInstance.mockClear();
});

afterEach(() => {
  ApiManager.getInstance = originalGetInstance;
});

describe("MoonbeamPostProcessHandler", () => {
  it("acknowledges legacy cleanup without opening an RPC connection", async () => {
    const handler = new MoonbeamPostProcessHandler();
    const state = { currentPhase: "complete", type: RampDirection.BUY } as RampState;

    expect(handler.shouldProcess(state)).toBe(true);
    await expect(handler.process(state)).resolves.toEqual([true, null]);
    expect(getInstance).not.toHaveBeenCalled();
  });
});
