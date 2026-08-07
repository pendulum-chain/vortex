import { type Address, isAddressEqual } from "viem";

export function assertExpectedWalletAccount(expectedAddress: Address, currentAddress?: Address): asserts currentAddress {
  if (!currentAddress) {
    throw new Error("No wallet account is connected.");
  }
  if (!isAddressEqual(expectedAddress, currentAddress)) {
    throw new Error("The connected wallet account changed. Reconnect the registered wallet and try again.");
  }
}
