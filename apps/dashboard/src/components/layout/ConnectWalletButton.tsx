import { useAppKit, useAppKitAccount } from "@reown/appkit/react";
import { Wallet } from "lucide-react";
import { useAccount } from "wagmi";
import { Button } from "@/components/ui/button";
import { shortenAddress } from "@/domain/transfer";
import { wagmiConfig } from "@/lib/wagmi";

export function ConnectWalletButton() {
  const { address, chainId } = useAccount();
  const { isConnected } = useAppKitAccount();
  const { open } = useAppKit();
  const isOnSupportedNetwork = wagmiConfig.chains.some(chain => chain.id === chainId);

  if (!isConnected) {
    return (
      <Button className="gap-2" onClick={() => open({ view: "Connect" })} type="button">
        <Wallet className="size-4 shrink-0" />
        Connect wallet
      </Button>
    );
  }

  if (!isOnSupportedNetwork) {
    // AppKit reports the wallet's current (unsupported) network as caipNetwork here, so
    // switchNetwork(caipNetwork) would be a no-op — let the user pick a supported one.
    return (
      <Button className="gap-2" onClick={() => open({ view: "Networks" })} type="button">
        Wrong network
      </Button>
    );
  }

  return (
    <Button className="gap-2" onClick={() => open({ view: "Account" })} type="button" variant="outline">
      <span aria-hidden className="size-2 shrink-0 rounded-full bg-success" />
      <span className="truncate">{address ? shortenAddress(address) : "Connected"}</span>
    </Button>
  );
}
