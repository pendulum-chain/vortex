import { useAppKit, useAppKitAccount } from "@reown/appkit/react";
import { KeyRound, Loader2, Wallet } from "lucide-react";
import { useState } from "react";
import { useAccount } from "wagmi";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { shortenAddress } from "@/domain/transfer";
import { wagmiConfig } from "@/lib/wagmi";
import { useWalletExperience } from "@/wallets/WalletExperienceContext";

export function ConnectWalletButton() {
  const { chainId } = useAccount();
  const { isConnected: isExternalConnected } = useAppKitAccount();
  const { open } = useAppKit();
  const wallet = useWalletExperience();
  const [chooserOpen, setChooserOpen] = useState(false);
  const isOnSupportedNetwork = wagmiConfig.chains.some(chain => chain.id === chainId);

  if (!wallet.connected) {
    return (
      <>
        <Button
          className="gap-2"
          disabled={!wallet.ready || wallet.creatingEmbeddedWallet}
          onClick={() => {
            if (wallet.mode === "cdp_embedded") {
              void wallet.createEmbeddedWallet();
            } else if (wallet.canUseEmbeddedWallet) {
              setChooserOpen(true);
            } else {
              void wallet.connectExternalWallet();
            }
          }}
          type="button"
        >
          {wallet.creatingEmbeddedWallet ? (
            <Loader2 className="size-4 shrink-0 animate-spin" />
          ) : (
            <Wallet className="size-4 shrink-0" />
          )}
          {wallet.mode === "cdp_embedded" ? "Create wallet" : wallet.canUseEmbeddedWallet ? "Choose wallet" : "Connect wallet"}
        </Button>
        <Dialog onOpenChange={setChooserOpen} open={chooserOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Choose how to use a wallet</DialogTitle>
              <DialogDescription>
                Use a wallet you already manage, or let Vortex create an embedded wallet for this account.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              <Button
                onClick={() => {
                  setChooserOpen(false);
                  void wallet.connectExternalWallet();
                }}
                type="button"
                variant="outline"
              >
                <Wallet className="size-4" />
                Connect an existing wallet
              </Button>
              <Button
                onClick={() => {
                  setChooserOpen(false);
                  void wallet.createEmbeddedWallet();
                }}
                type="button"
              >
                <KeyRound className="size-4" />
                Create an embedded wallet
              </Button>
              <p className="text-muted-foreground text-xs">
                Embedded wallets are optional. Choosing one does not give Vortex access to sign without your approval.
              </p>
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  if (wallet.mode !== "cdp_embedded" && isExternalConnected && !isOnSupportedNetwork) {
    // AppKit reports the wallet's current (unsupported) network as caipNetwork here, so
    // switchNetwork(caipNetwork) would be a no-op — let the user pick a supported one.
    return (
      <Button className="gap-2" onClick={() => open({ view: "Networks" })} type="button">
        Wrong network
      </Button>
    );
  }

  return (
    <Button
      className="gap-2"
      onClick={() => {
        if (wallet.mode !== "cdp_embedded") void open({ view: "Account" });
      }}
      type="button"
      variant="outline"
    >
      <span aria-hidden className="size-2 shrink-0 rounded-full bg-success" />
      <span className="truncate">{wallet.address ? shortenAddress(wallet.address) : "Connected"}</span>
    </Button>
  );
}
