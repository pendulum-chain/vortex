import {describe, expect, test} from "bun:test";
import {createUsdcBaseRebalanceState, UsdcBaseRebalancePhase} from "../../services/stateManager.ts";
import {
  ensurePolygonBrlaAvailableForSquidSwap,
  recoverAveniaPolygonTransferFromBalance,
  recoverSquidUsdcOutputFromBaseBalance,
  resetFailedNablaSwapOnResume,
  resetFailedSquidRouterSwapOnResume
} from "./steps.ts";

describe("USDC Base SquidRouter steps", () => {
  test("clears a persisted Nabla swap when the Base receipt failed", async () => {
    const state = createUsdcBaseRebalanceState("1000000000", UsdcBaseRebalancePhase.NablaApprove);
    state.nablaSwapHash = "0xfailed";

    const savedStates: Array<{ nablaSwapHash: string | null }> = [];
    const stateManager = {
      saveState: async () => {
        savedStates.push({ nablaSwapHash: state.nablaSwapHash });
      }
    };
    const publicClient = {
      getTransactionReceipt: async () => ({ status: "reverted" as const })
    };

    await expect(resetFailedNablaSwapOnResume("0xfailed", state, stateManager, publicClient)).resolves.toBe(true);
    expect(state.nablaSwapHash).toBeNull();
    expect(savedStates).toEqual([{ nablaSwapHash: null }]);
  });

  test("keeps a persisted Nabla swap when the Base receipt succeeded", async () => {
    const state = createUsdcBaseRebalanceState("1000000000", UsdcBaseRebalancePhase.NablaApprove);
    state.nablaSwapHash = "0xsuccess";

    const stateManager = {
      saveState: async () => {
        throw new Error("successful receipts should not rewrite state");
      }
    };
    const publicClient = {
      getTransactionReceipt: async () => ({ status: "success" as const })
    };

    await expect(resetFailedNablaSwapOnResume("0xsuccess", state, stateManager, publicClient)).resolves.toBe(false);
    expect(state.nablaSwapHash).toBe("0xsuccess");
  });

  test("clears a stale persisted Nabla swap when the Base receipt is missing", async () => {
    const state = createUsdcBaseRebalanceState("1000000000", UsdcBaseRebalancePhase.NablaApprove);
    state.nablaSwapHash = "0xmissing";
    state.updatedTime = new Date(Date.now() - 16 * 60_000).toISOString();

    const savedStates: Array<{ nablaSwapHash: string | null }> = [];
    const stateManager = {
      saveState: async () => {
        savedStates.push({ nablaSwapHash: state.nablaSwapHash });
      }
    };
    const publicClient = {
      getTransactionReceipt: async () => {
        throw new Error("Transaction not found");
      }
    };

    await expect(resetFailedNablaSwapOnResume("0xmissing", state, stateManager, publicClient)).resolves.toBe(true);
    expect(state.nablaSwapHash).toBeNull();
    expect(savedStates).toEqual([{ nablaSwapHash: null }]);
  });

  test("keeps a fresh persisted Nabla swap when the Base receipt is temporarily missing", async () => {
    const state = createUsdcBaseRebalanceState("1000000000", UsdcBaseRebalancePhase.NablaApprove);
    state.nablaSwapHash = "0xmissing";

    const stateManager = {
      saveState: async () => {
        throw new Error("fresh missing receipts should not rewrite state");
      }
    };
    const publicClient = {
      getTransactionReceipt: async () => {
        throw new Error("Transaction not found");
      }
    };

    await expect(resetFailedNablaSwapOnResume("0xmissing", state, stateManager, publicClient)).rejects.toThrow(
      "Transaction not found"
    );
    expect(state.nablaSwapHash).toBe("0xmissing");
  });

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

  test("recovers SquidRouter output with a missing Squid quote using the persisted Avenia quote", async () => {
    const state = createUsdcBaseRebalanceState("1000000000", UsdcBaseRebalancePhase.SquidRouterApproveAndSwap);
    state.aveniaQuoteUsdc = "997124681";
    state.squidRouterQuoteUsdc = null;

    const savedStates: Array<{ squidRouterQuoteUsdc: string | null }> = [];
    const stateManager = {
      saveState: async () => {
        savedStates.push({ squidRouterQuoteUsdc: state.squidRouterQuoteUsdc });
      }
    };

    await expect(
      recoverSquidUsdcOutputFromBaseBalance(null, "22337450", state, stateManager, async () => "1021377450")
    ).resolves.toBe("999040000");
    expect(state.squidRouterQuoteUsdc as string | null).toBe("999040000");
    expect(savedStates).toEqual([{ squidRouterQuoteUsdc: "999040000" }]);
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

  test("recovers Avenia Polygon transfer from BRLA balance delta", async () => {
    const state = createUsdcBaseRebalanceState("1000000000", UsdcBaseRebalancePhase.AveniaTransferToPolygon);
    const savedStates: Array<{ brlaAmountDecimal: string | null; brlaAmountRaw: string | null }> = [];
    const stateManager = {
      saveState: async () => {
        savedStates.push({ brlaAmountDecimal: state.brlaAmountDecimal, brlaAmountRaw: state.brlaAmountRaw });
      }
    };

    await expect(
      recoverAveniaPolygonTransferFromBalance(
        "5229427423000000000000",
        "4045105000000000000",
        state,
        stateManager,
        async () => "5233472528000000000000"
      )
    ).resolves.toBe("5229427423000000000000");
    expect(state.brlaAmountRaw).toBe("5229427423000000000000");
    expect(state.brlaAmountDecimal).toBe("5229.427423");
    expect(savedStates).toEqual([{ brlaAmountDecimal: "5229.427423", brlaAmountRaw: "5229427423000000000000" }]);
  });

  test("does not recover Avenia Polygon transfer when BRLA delta is below tolerance", async () => {
    const state = createUsdcBaseRebalanceState("1000000000", UsdcBaseRebalancePhase.AveniaTransferToPolygon);
    const stateManager = {
      saveState: async () => {
        throw new Error("insufficient recovery delta should not rewrite state");
      }
    };

    await expect(
      recoverAveniaPolygonTransferFromBalance(
        "5229427423000000000000",
        "4045105000000000000",
        state,
        stateManager,
        async () => "4900000000000000000000"
      )
    ).resolves.toBeNull();
    expect(state.brlaAmountRaw).toBeNull();
    expect(state.brlaAmountDecimal).toBeNull();
  });
});
