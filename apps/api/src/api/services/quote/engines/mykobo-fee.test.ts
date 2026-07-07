import { MykoboApiService } from "@vortexfi/shared";
import { afterEach, describe, expect, it, mock } from "bun:test";
import { config } from "../../../../config/vars";
import { MykoboFeeUnavailableError, resolveMykoboDepositFee, resolveMykoboWithdrawFee } from "./mykobo-fee";

describe("resolveMykobo*Fee", () => {
  const originalGetInstance = MykoboApiService.getInstance;
  const originalFallback = { ...config.mykobo.feeFallback };

  afterEach(() => {
    MykoboApiService.getInstance = originalGetInstance;
    config.mykobo.feeFallback = { ...originalFallback };
  });

  function stubFees(overrides: { deposit?: () => Promise<{ total: string }>; withdraw?: () => Promise<{ total: string }> }) {
    MykoboApiService.getInstance = mock(() => ({
      defaultDepositFee: overrides.deposit ?? (async () => ({ total: "0.06" })),
      defaultWithdrawFee: overrides.withdraw ?? (async () => ({ total: "0.09" }))
    })) as unknown as typeof MykoboApiService.getInstance;
  }

  it("returns the live fee total when the lookup succeeds", async () => {
    stubFees({ deposit: async () => ({ total: "0.06" }), withdraw: async () => ({ total: "0.09" }) });
    config.mykobo.feeFallback = { depositFee: "1.50", enabled: true, withdrawFee: "2.00" };

    expect(await resolveMykoboDepositFee("100.00")).toBe("0.06");
    expect(await resolveMykoboWithdrawFee("100.00")).toBe("0.09");
  });

  it("throws MykoboFeeUnavailableError when the lookup fails and the fallback is disabled", async () => {
    const boom = async () => {
      throw new Error("Mykobo GET /fees failed: 500");
    };
    stubFees({ deposit: boom, withdraw: boom });
    config.mykobo.feeFallback = { depositFee: undefined, enabled: false, withdrawFee: undefined };

    const depositError = await resolveMykoboDepositFee("100.00").catch(error => error);
    expect(depositError).toBeInstanceOf(MykoboFeeUnavailableError);
    expect(depositError.kind).toBe("deposit");

    const withdrawError = await resolveMykoboWithdrawFee("100.00").catch(error => error);
    expect(withdrawError).toBeInstanceOf(MykoboFeeUnavailableError);
    expect(withdrawError.kind).toBe("withdraw");
  });

  it("returns the configured flat fallback fee when the lookup fails and the fallback is enabled", async () => {
    const boom = async () => {
      throw new Error("Unable to connect");
    };
    stubFees({ deposit: boom, withdraw: boom });
    config.mykobo.feeFallback = { depositFee: "1.50", enabled: true, withdrawFee: "2.00" };

    expect(await resolveMykoboDepositFee("100.00")).toBe("1.50");
    expect(await resolveMykoboWithdrawFee("100.00")).toBe("2.00");
  });
});
