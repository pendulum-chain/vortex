import { Building2, Check, ChevronsUpDown, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/cn";
import { useDashboardStore } from "@/stores/dashboard.store";

export function AccountSwitcher() {
  const accounts = useDashboardStore(state => state.accounts);
  const activeAccountId = useDashboardStore(state => state.activeAccountId);
  const setActiveAccount = useDashboardStore(state => state.setActiveAccount);
  const active = accounts.find(account => account.id === activeAccountId) ?? accounts[0];

  if (!active) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="h-9 justify-between gap-2 px-2.5" variant="outline">
          {active.type === "company" ? (
            <Building2 className="text-muted-foreground" />
          ) : (
            <User className="text-muted-foreground" />
          )}
          <span className="max-w-[14rem] truncate font-medium">{active.name}</span>
          <ChevronsUpDown className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Sender accounts</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {accounts.map(account => (
          <DropdownMenuItem className="gap-2" key={account.id} onClick={() => setActiveAccount(account.id)}>
            {account.type === "company" ? <Building2 /> : <User />}
            <div className="grid flex-1">
              <span className="truncate font-medium text-sm">{account.name}</span>
              <span className="truncate text-muted-foreground text-xs capitalize">
                {account.type} · {account.identifier}
              </span>
            </div>
            <Check className={cn("size-4", account.id === active.id ? "opacity-100" : "opacity-0")} />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
