import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { selectCdpEmbeddedWallet } from "./cdpWalletSelection";
import { assertExpectedWalletAccount } from "./walletAccount";

const REGISTERED_ADDRESS = "0x1111111111111111111111111111111111111111";
const OTHER_ADDRESS = "0x2222222222222222222222222222222222222222";

describe("wallet identity", () => {
  it("restores the registered CDP wallet instead of relying on SDK order", () => {
    const user = {
      evmAccountObjects: [{ address: OTHER_ADDRESS }, { address: REGISTERED_ADDRESS }],
      userId: "registered-user"
    };

    const selected = selectCdpEmbeddedWallet(user, {
      address: REGISTERED_ADDRESS,
      providerWalletId: "registered-user"
    });

    assert.equal(selected?.address, REGISTERED_ADDRESS);
  });

  it("rejects a CDP identity that differs from the registered identity", () => {
    const selected = selectCdpEmbeddedWallet(
      { evmAccountObjects: [{ address: REGISTERED_ADDRESS }], userId: "other-user" },
      { address: REGISTERED_ADDRESS, providerWalletId: "registered-user" }
    );
    assert.equal(selected, undefined);
  });

  it("rejects a connector account that differs from the adapter account", () => {
    assert.doesNotThrow(() => assertExpectedWalletAccount(REGISTERED_ADDRESS, REGISTERED_ADDRESS));
    assert.throws(
      () => assertExpectedWalletAccount(REGISTERED_ADDRESS, OTHER_ADDRESS),
      /connected wallet account changed/
    );
  });
});
