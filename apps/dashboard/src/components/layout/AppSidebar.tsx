import { Link, useRouterState } from "@tanstack/react-router";
import { ArrowLeftRight, LayoutDashboard, Send, Settings, Wallet } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail
} from "@/components/ui/sidebar";
import { VortexLogo } from "./VortexLogo";

const NAV_ITEMS = [
  { icon: LayoutDashboard, label: "Overview", to: "/overview" },
  { icon: Wallet, label: "New transfer", to: "/transfer" },
  { icon: ArrowLeftRight, label: "Transactions", to: "/transactions" },
  { icon: Send, label: "Recipients", to: "/recipients" },
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
          <SidebarGroupLabel>Onboarding</SidebarGroupLabel>
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
        <p className="px-2 text-muted-foreground text-xs">Cross-border transfers, unlocked.</p>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
