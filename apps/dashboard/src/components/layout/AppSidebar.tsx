import { Link, useRouterState } from "@tanstack/react-router";
import { ArrowLeftRight, Send, Settings, ShieldCheck, Users } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail
} from "@/components/ui/sidebar";
import { ConnectWalletButton } from "./ConnectWalletButton";
import { VortexLogo } from "./VortexLogo";

const NAV_ITEMS = [
  { icon: ShieldCheck, label: "Onboarding", to: "/overview" },
  { icon: Users, label: "Recipients", to: "/recipients" },
  { icon: Send, label: "New transfer", to: "/transfer" },
  { icon: ArrowLeftRight, label: "Transactions", to: "/transactions" },
  { icon: Settings, label: "Settings", to: "/settings" }
] as const;

export function AppSidebar() {
  const pathname = useRouterState({ select: state => state.location.pathname });

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="px-1 py-1.5">
          <VortexLogo />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map(item => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton asChild isActive={pathname.startsWith(item.to)} tooltip={item.label}>
                    <Link to={item.to}>
                      <item.icon />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <ConnectWalletButton />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
