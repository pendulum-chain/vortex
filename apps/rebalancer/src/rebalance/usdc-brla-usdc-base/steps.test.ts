import {describe, expect, test} from "bun:test";
import {createUsdcBaseRebalanceState, UsdcBaseRebalancePhase} from "../../services/stateManager.ts";
import {
  ensurePolygonBrlaAvailableForSquidSwap,
  recoverSquidUsdcOutputFromBaseBalance,
  resetFailedSquidRouterSwapOnResume
} from "./steps.ts";

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
      waitForTransactionReceipt: async () => ({ status: "reverted" })
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
      waitForTransactionReceipt: async () => ({ status: "success" })
    };

    await expect(
      resetFailedSquidRouterSwapOnResume("0xsuccess", state, stateManager, publicClient as never)
    ).resolves.toBe(false);
    expect(state.squidRouterSwapHash).toBe("0xsuccess");
    expect(state.squidRouterQuoteUsdc).toBe("999060253");
  });

  test("recovers SquidRouter output from Base USDC balance delta", async () => {
    const state = createUsdcBaseRebalanceState("1000000000", UsdcBaseRebalancePhase.SquidRouterApproveAndSwap);
    state.squidRouterQuoteUsdc = "999000000";

    const savedStates: Array<{ squidRouterQuoteUsdc: string | null }> = [];
    const stateManager = {
      saveState: async () => {
        savedStates.push({ squidRouterQuoteUsdc: state.squidRouterQuoteUsdc });
      }
    };

    await expect(
      recoverSquidUsdcOutputFromBaseBalance(
        "999000000",
        "1000000",
        state,
        stateManager,
        async () => "999500000"
      )
    ).resolves.toBe("998500000");
    expect(state.squidRouterQuoteUsdc).toBe("998500000");
    expect(savedStates).toEqual([{ squidRouterQuoteUsdc: "998500000" }]);
  });

  test("does not recover SquidRouter output when Base USDC delta is below tolerance", async () => {
    const state = createUsdcBaseRebalanceState("1000000000", UsdcBaseRebalancePhase.SquidRouterApproveAndSwap);
    state.squidRouterQuoteUsdc = "999000000";

    const stateManager = {
      saveState: async () => {
        throw new Error("insufficient recovery delta should not rewrite state");
      }
    };

    await expect(
      recoverSquidUsdcOutputFromBaseBalance(
        "999000000",
        "1000000",
        state,
        stateManager,
        async () => "997000000"
      )
    ).resolves.toBeNull();
    expect(state.squidRouterQuoteUsdc).toBe("999000000");
  });

  test("blocks SquidRouter swaps when Polygon BRLA is below the required input", () => {
    expect(() => ensurePolygonBrlaAvailableForSquidSwap("499999999999999999999", "500000000000000000000")).toThrow(
      "Insufficient Polygon BRLA"
    );
    expect(() => ensurePolygonBrlaAvailableForSquidSwap("500000000000000000000", "500000000000000000000")).not.toThrow();
  });
});
