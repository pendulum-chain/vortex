import { createFileRoute } from "@tanstack/react-router";
import { Building2, Copy, KeyRound, User, Wallet } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActiveAccount } from "@/hooks/useActiveAccount";
import { useAuthStore } from "@/stores/auth.store";
import { useWalletExperience } from "@/wallets/WalletExperienceContext";

const NOTIFICATION_PREFS = [
  {
    defaultChecked: true,
    description: "When a corridor's KYB/KYC is approved or rejected.",
    id: "onboarding",
    label: "Onboarding updates"
  },
  {
    defaultChecked: true,
    description: "When an invited recipient completes KYC/KYB.",
    id: "recipients",
    label: "Recipient approvals"
  },
  {
    defaultChecked: true,
    description: "When a wallet-to-fiat pay-out settles or fails.",
    id: "transfers",
    label: "Transfer status"
  }
] as const;

export const Route = createFileRoute("/_app/settings")({
  component: SettingsPage
});

function SettingsPage() {
  const user = useAuthStore(state => state.user);
  const account = useActiveAccount();
  const wallet = useWalletExperience();

  return (
    <Stagger className="mx-auto grid max-w-3xl gap-6">
      <StaggerItem>
        <h1 className="text-balance font-semibold text-2xl tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Your profile and linked sender accounts.</p>
      </StaggerItem>

      <StaggerItem>
        <Card>
          <CardHeader>
            <CardTitle>Wallet</CardTitle>
            <CardDescription>An embedded wallet is optional. You can keep using a wallet you already control.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="surface-raised flex items-center gap-3 rounded-lg p-3">
              <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                {wallet.mode === "cdp_embedded" ? <KeyRound className="size-4" /> : <Wallet className="size-4" />}
              </span>
              <div className="grid flex-1">
                <span className="font-medium text-sm">
                  {wallet.mode === "cdp_embedded" ? "Vortex embedded wallet" : "Existing wallet"}
                </span>
                <span className="text-muted-foreground text-xs">
                  {wallet.address ?? (wallet.connected ? "Connected" : "Not connected")}
                </span>
              </div>
              <Badge variant="secondary">{wallet.mode === "cdp_embedded" ? "Embedded" : "External"}</Badge>
            </div>
            {wallet.mode === "cdp_embedded" && wallet.address && (
              <div className="surface-raised grid justify-items-center gap-2 rounded-lg p-4">
                <div className="rounded-lg bg-white p-3">
                  <QRCodeSVG aria-label="Embedded wallet receive address" size={128} value={wallet.address} />
                </div>
                <p className="text-center text-muted-foreground text-xs">
                  Scan to receive supported EVM assets at this address.
                </p>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {wallet.mode === "cdp_embedded" ? (
                <>
                  {wallet.address && (
                    <>
                      <Button
                        onClick={() => void navigator.clipboard.writeText(wallet.address as string)}
                        type="button"
                        variant="outline"
                      >
                        <Copy className="size-4" />
                        Copy receive address
                      </Button>
                      <Button onClick={() => void wallet.exportEmbeddedWallet()} type="button" variant="outline">
                        Export wallet
                      </Button>
                    </>
                  )}
                  <Button onClick={() => void wallet.switchToExternalWallet()} type="button" variant="outline">
                    Use an existing wallet
                  </Button>
                </>
              ) : (
                <>
                  <Button onClick={() => void wallet.connectExternalWallet()} type="button" variant="outline">
                    Connect existing wallet
                  </Button>
                  {wallet.canUseEmbeddedWallet && (
                    <Button
                      disabled={wallet.creatingEmbeddedWallet}
                      onClick={() => void wallet.createEmbeddedWallet()}
                      type="button"
                    >
                      Create embedded wallet
                    </Button>
                  )}
                </>
              )}
            </div>
            {wallet.error && <p className="text-destructive text-sm">{wallet.error}</p>}
          </CardContent>
        </Card>
      </StaggerItem>

      <StaggerItem>
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>Demo profile derived from your login email.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Name</Label>
              <Input defaultValue={user?.name ?? ""} readOnly />
            </div>
            <div className="grid gap-2">
              <Label>Email</Label>
              <Input defaultValue={user?.email ?? ""} readOnly />
            </div>
          </CardContent>
        </Card>
      </StaggerItem>

      <StaggerItem>
        <Card>
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
            <CardDescription>Email and in-app alerts for your workspace.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {NOTIFICATION_PREFS.map(pref => (
              <Label
                className="surface-raised flex items-start gap-3 rounded-lg p-3 font-normal hover:bg-accent/40"
                htmlFor={pref.id}
                key={pref.id}
              >
                <Checkbox defaultChecked={pref.defaultChecked} id={pref.id} />
                <span className="grid gap-0.5">
                  <span className="font-medium text-sm">{pref.label}</span>
                  <span className="text-muted-foreground text-xs">{pref.description}</span>
                </span>
              </Label>
            ))}
          </CardContent>
        </Card>
      </StaggerItem>

      <StaggerItem>
        <Card>
          <CardHeader>
            <CardTitle>Sender account</CardTitle>
            <CardDescription>The account you onboard and transfer from.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {account && (
              <div className="surface-raised flex items-center gap-3 rounded-lg p-3">
                <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  {account.type === "company" ? <Building2 className="size-4" /> : <User className="size-4" />}
                </span>
                <div className="grid flex-1">
                  <span className="font-medium text-sm">{account.name}</span>
                  <span className="text-muted-foreground text-xs">{account.identifier}</span>
                </div>
                <Badge className="capitalize" variant="secondary">
                  {account.type}
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>
      </StaggerItem>
    </Stagger>
  );
}
