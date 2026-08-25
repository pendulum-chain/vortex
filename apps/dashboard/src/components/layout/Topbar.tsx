import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useManagedProfileSelection } from "@/stores/managed-profile.store";
import { AccountSwitcher } from "./AccountSwitcher";
import { ConnectWalletButton } from "./ConnectWalletButton";
import { NotificationsBell } from "./NotificationsBell";
import { UserMenu } from "./UserMenu";

export function Topbar() {
  const managedProfile = useManagedProfileSelection();
  return (
    <header className="flex h-16 min-w-0 shrink-0 items-center gap-1 border-b bg-background/80 px-2 backdrop-blur sm:gap-2 sm:px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator className="mr-1 h-5" orientation="vertical" />
      <AccountSwitcher />
      <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
        <ConnectWalletButton />
        {!managedProfile && <NotificationsBell />}
        <UserMenu />
      </div>
    </header>
  );
}
