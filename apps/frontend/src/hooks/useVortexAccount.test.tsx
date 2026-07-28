// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { Networks } from "@vortexfi/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  activateSigner: vi.fn(),
  address: undefined as `0x${string}` | undefined,
  rampSend: vi.fn()
}));

vi.mock("wagmi", () => ({
  useAccount: () => ({ chainId: 8453 })
}));

vi.mock("../contexts/network", () => ({
  useNetwork: () => ({ selectedNetwork: Networks.Base })
}));

vi.mock("../contexts/polkadotWallet", () => ({
  usePolkadotWalletState: () => ({ walletAccount: undefined })
}));

vi.mock("../contexts/rampState", () => ({
  useRampActor: () => ({ send: mocks.rampSend })
}));

vi.mock("../wallets/WidgetWalletContext", () => ({
  useWidgetWallet: () => ({
    activateSigner: mocks.activateSigner,
    address: mocks.address,
    mode: "external",
    signMessage: vi.fn()
  })
}));

import { useVortexAccount } from "./useVortexAccount";

describe("useVortexAccount", () => {
  beforeEach(() => {
    mocks.activateSigner.mockClear();
    mocks.rampSend.mockClear();
    mocks.address = "0x1111111111111111111111111111111111111111";
  });

  it("does not clear the ramp address when the wallet address is transiently unavailable", () => {
    const { rerender } = renderHook(() => useVortexAccount());

    expect(mocks.rampSend).toHaveBeenCalledWith({
      address: mocks.address,
      type: "SET_ADDRESS"
    });

    mocks.address = undefined;
    rerender();

    expect(mocks.rampSend.mock.calls.filter(([event]) => event.type === "SET_ADDRESS")).toHaveLength(1);
  });
});
