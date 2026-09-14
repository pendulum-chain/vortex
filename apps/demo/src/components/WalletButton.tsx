import { useAppKit } from "@reown/appkit/react";

import { useBscWallet } from "../hooks/useBscWallet";

function shortenAddress(address: `0x${string}`) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function WalletButton() {
  const { open } = useAppKit();
  const { destinationAddress, isConnected, isOnBsc, isSwitchingNetwork, switchToBsc } = useBscWallet();

  if (!isConnected) {
    return (
      <button className="wallet-button" onClick={() => open({ view: "Connect" })} type="button">
        Connect wallet
      </button>
    );
  }

  if (!isOnBsc) {
    return (
      <button
        className="wallet-button wallet-button--warning"
        disabled={isSwitchingNetwork}
        onClick={switchToBsc}
        type="button"
      >
        {isSwitchingNetwork ? "Switching..." : "Switch to BSC"}
      </button>
    );
  }

  return (
    <button className="wallet-button wallet-button--connected" onClick={() => open({ view: "Account" })} type="button">
      <span aria-hidden="true" className="wallet-button__status" />
      {destinationAddress ? shortenAddress(destinationAddress) : "Wallet"}
    </button>
  );
}
