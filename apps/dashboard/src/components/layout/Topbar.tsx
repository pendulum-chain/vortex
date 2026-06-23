import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { AccountSwitcher } from "./AccountSwitcher";
import { NotificationsBell } from "./NotificationsBell";
import { UserMenu } from "./UserMenu";

export function Topbar() {
  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur">
      <SidebarTrigger className="-ml-1" />
      <Separator className="mr-1 h-5" orientation="vertical" />
      <AccountSwitcher />
      <div className="ml-auto flex items-center gap-2">
        <NotificationsBell />
        <UserMenu />
      </div>
    </header>
  );
}
