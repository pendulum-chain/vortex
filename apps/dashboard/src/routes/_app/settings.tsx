import { createFileRoute } from "@tanstack/react-router";
import { Building2, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthStore } from "@/stores/auth.store";
import { useDashboardStore } from "@/stores/dashboard.store";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsPage
});

function SettingsPage() {
  const user = useAuthStore(state => state.user);
  const accounts = useDashboardStore(state => state.accounts);

  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Your profile and linked sender accounts.</p>
      </div>

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

      <Card>
        <CardHeader>
          <CardTitle>Sender accounts</CardTitle>
          <CardDescription>Accounts you can onboard and transfer from.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {accounts.map(account => (
            <div className="flex items-center gap-3 rounded-lg border p-3" key={account.id}>
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
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
