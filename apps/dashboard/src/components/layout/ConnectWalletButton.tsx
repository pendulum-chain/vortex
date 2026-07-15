import { ConnectKitButton } from "connectkit";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ConnectWalletButton() {
  return (
    <ConnectKitButton.Custom>
      {({ isConnected, isConnecting, show, truncatedAddress, ensName }) => (
        <Button
          className="gap-2"
          disabled={isConnecting}
          onClick={show}
          type="button"
          variant={isConnected ? "outline" : "default"}
        >
          {isConnected ? (
            <span aria-hidden className="size-2 shrink-0 rounded-full bg-success" />
          ) : (
            <Wallet className="size-4 shrink-0" />
          )}
          <span className="truncate">
            {isConnecting ? "Connecting…" : isConnected ? (ensName ?? truncatedAddress) : "Connect wallet"}
          </span>
        </Button>
      )}
    </ConnectKitButton.Custom>
  );
}
