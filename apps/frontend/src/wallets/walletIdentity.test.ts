import { describe, expect, it } from "vitest";
import { selectPrivyEmbeddedWallet } from "./privyWalletSelection";
import { assertExpectedWalletAccount } from "./walletAccount";

const REGISTERED_ADDRESS = "0x1111111111111111111111111111111111111111";
const OTHER_ADDRESS = "0x2222222222222222222222222222222222222222";

describe("wallet identity", () => {
  it("restores the registered Privy wallet instead of relying on SDK order", () => {
    const wallets = [
      { address: OTHER_ADDRESS, type: "ethereum", walletClientType: "privy" },
      { address: REGISTERED_ADDRESS, type: "ethereum", walletClientType: "privy-v2" }
    ];

    const selected = selectPrivyEmbeddedWallet(wallets, {
      address: REGISTERED_ADDRESS,
      providerWalletId: "registered-wallet"
    });

    expect(selected?.address).toBe(REGISTERED_ADDRESS);
  });

  it("rejects a connector account that differs from the adapter account", () => {
    expect(() => assertExpectedWalletAccount(REGISTERED_ADDRESS, REGISTERED_ADDRESS)).not.toThrow();
    expect(() => assertExpectedWalletAccount(REGISTERED_ADDRESS, OTHER_ADDRESS)).toThrow(
      "connected wallet account changed"
    );
  });
});
