import {describe, expect, test} from "bun:test";
import {createUsdcBaseRebalanceState, UsdcBaseRebalancePhase} from "../../services/stateManager.ts";
import {resetFailedSquidRouterSwapOnResume} from "./steps.ts";

describe("USDC Base SquidRouter steps", () => {
  test("clears a persisted SquidRouter swap when the Polygon receipt failed", async () => {
    const state = createUsdcBaseRebalanceState("1000000000", UsdcBaseRebalancePhase.SquidRouterApproveAndSwap);
    state.squidRouterSwapHash = "0xfailed";
    state.squidRouterQuoteUsdc = "999060253";

    const savedStates: Array<{ squidRouterQuoteUsdc: string | null; squidRouterSwapHash: string | null }> = [];
    const stateManager = {
      saveState: async () => {
        savedStates.push({ squidRouterQuoteUsdc: state.squidRouterQuoteUsdc, squidRouterSwapHash: state.squidRouterSwapHash });
      }
    };
    const publicClient = {
      getTransactionReceipt: async () => ({ status: "reverted" })
    };

    await expect(
      resetFailedSquidRouterSwapOnResume("0xfailed", state, stateManager, publicClient as never)
    ).resolves.toBe(true);
    expect(state.squidRouterSwapHash).toBeNull();
    expect(state.squidRouterQuoteUsdc).toBeNull();
    expect(savedStates).toEqual([{ squidRouterQuoteUsdc: null, squidRouterSwapHash: null }]);
  });

  test("keeps a persisted SquidRouter swap when the Polygon receipt succeeded", async () => {
    const state = createUsdcBaseRebalanceState("1000000000", UsdcBaseRebalancePhase.SquidRouterApproveAndSwap);
    state.squidRouterSwapHash = "0xsuccess";
    state.squidRouterQuoteUsdc = "999060253";

    const stateManager = {
      saveState: async () => {
        throw new Error("successful receipts should not rewrite state");
      }
    };
    const publicClient = {
      getTransactionReceipt: async () => ({ status: "success" })
    };

    await expect(
      resetFailedSquidRouterSwapOnResume("0xsuccess", state, stateManager, publicClient as never)
    ).resolves.toBe(false);
    expect(state.squidRouterSwapHash).toBe("0xsuccess");
    expect(state.squidRouterQuoteUsdc).toBe("999060253");
  });
});
