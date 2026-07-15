import { createFileRoute } from "@tanstack/react-router";
import { Building2, User } from "lucide-react";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActiveAccount } from "@/hooks/useActiveAccount";
import { useAuthStore } from "@/stores/auth.store";

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
    description: "When a wallet-to-fiat payout settles or fails.",
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

  return (
    <Stagger className="mx-auto grid max-w-3xl gap-6">
      <StaggerItem>
        <h1 className="text-balance font-semibold text-2xl tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Your profile and linked sender accounts.</p>
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
