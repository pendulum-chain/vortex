import { describe, expect, it } from "bun:test";
import { EPaymentMethod, Networks } from "@vortexfi/shared";
import { isMoonbeamRuntimeDisabled, isMoonbeamRuntimeDisabledForState } from "./moonbeam-runtime";

describe("isMoonbeamRuntimeDisabled", () => {
  it("disables direct Moonbeam sources, destinations, and transactions", () => {
    expect(isMoonbeamRuntimeDisabled({ from: Networks.Moonbeam, to: Networks.Base })).toBe(true);
    expect(isMoonbeamRuntimeDisabled({ from: Networks.Base, to: Networks.Moonbeam })).toBe(true);
    expect(
      isMoonbeamRuntimeDisabled({
        from: Networks.AssetHub,
        to: Networks.Base,
        transactionNetworks: [Networks.Pendulum, Networks.Moonbeam]
      })
    ).toBe(true);
  });

  it("disables the AssetHub flows that use Moonbeam internally", () => {
    expect(
      isMoonbeamRuntimeDisabled({ flowId: "BrlOnrampAssethubUsdc", from: "pix", to: Networks.AssetHub })
    ).toBe(true);
    expect(
      isMoonbeamRuntimeDisabled({ flowId: "BrlOfframpAssethubUsdc", from: Networks.AssetHub, to: "pix" })
    ).toBe(true);
    expect(isMoonbeamRuntimeDisabled({ from: EPaymentMethod.PIX, to: Networks.AssetHub })).toBe(true);
    expect(isMoonbeamRuntimeDisabled({ from: Networks.AssetHub, to: EPaymentMethod.PIX })).toBe(true);
  });

  it("leaves unrelated flows enabled", () => {
    expect(isMoonbeamRuntimeDisabled({ flowId: "BrlOnrampBaseDirect", from: "pix", to: Networks.Base })).toBe(false);
  });

  it("detects persisted Moonbeam state for worker filtering", () => {
    expect(
      isMoonbeamRuntimeDisabledForState({
        from: EPaymentMethod.PIX,
        state: { flow: { id: "BrlOnrampAssethubUsdc" } },
        to: Networks.AssetHub,
        unsignedTxs: []
      })
    ).toBe(true);
  });
});
