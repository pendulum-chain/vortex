import { Link, useRouterState } from "@tanstack/react-router";
import { ArrowLeftRight, Calculator, Gauge, KeyRound, Send, Settings, ShieldCheck, UserCog, Users } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail
} from "@/components/ui/sidebar";
import { useOnboardingStatusQuery } from "@/hooks/useApprovedCorridors";
import { useImpersonationSession } from "@/stores/impersonation.store";
import { VortexLogo } from "./VortexLogo";

const NAV_ITEMS = [
  { icon: ShieldCheck, label: "Onboarding", to: "/overview" },
  { icon: Users, label: "Recipients", to: "/recipients" },
  { icon: Calculator, label: "Get a quote", to: "/quote" },
  { icon: Send, label: "New transfer", to: "/transfer" },
  { icon: ArrowLeftRight, label: "Transactions", to: "/transactions" },
  { icon: KeyRound, label: "API keys", to: "/api-keys" },
  { icon: Gauge, label: "Limits", to: "/limits" },
  { icon: Settings, label: "Settings", to: "/settings" }
] as const;

const ADMIN_NAV_ITEM = { icon: UserCog, label: "Admin", to: "/admin" } as const;

export function AppSidebar() {
  const pathname = useRouterState({ select: state => state.location.pathname });
  const { data: onboardingStatus } = useOnboardingStatusQuery();
  const isImpersonating = useImpersonationSession() !== null;
  const isAdmin = onboardingStatus?.roles.includes("vortex_admin") ?? false;
  // An operator acting as a customer must see exactly the customer's navigation.
  const navItems = isAdmin && !isImpersonating ? [...NAV_ITEMS, ADMIN_NAV_ITEM] : NAV_ITEMS;

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
              {navItems.map(item => (
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
      <SidebarRail />
    </Sidebar>
  );
}
