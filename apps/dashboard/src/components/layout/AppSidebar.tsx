import { Link, useRouterState } from "@tanstack/react-router";
import {
  ArrowLeftRight,
  Calculator,
  Gauge,
  KeyRound,
  RefreshCw,
  Send,
  Settings,
  ShieldCheck,
  UserCog,
  Users,
  UsersRound
} from "lucide-react";
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
import { isManagedProfilesAccessDenied, useManagedProfiles } from "@/hooks/useManagedProfiles";
import { useImpersonationSession } from "@/stores/impersonation.store";
import { useManagedProfileSelection } from "@/stores/managed-profile.store";
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
const MANAGED_PROFILES_NAV_ITEM = { icon: UsersRound, label: "Managed profiles", to: "/managed-profiles" } as const;
const CHILD_NAV_ITEMS = NAV_ITEMS.filter(item => item.to !== "/api-keys" && item.to !== "/settings");

export function AppSidebar() {
  const pathname = useRouterState({ select: state => state.location.pathname });
  const { data: onboardingStatus } = useOnboardingStatusQuery();
  const managedProfile = useManagedProfileSelection();
  const managedProfiles = useManagedProfiles({ limit: 1, offset: 0 }, !managedProfile);
  const isImpersonating = useImpersonationSession() !== null;
  const isAdmin = onboardingStatus?.roles.includes("vortex_admin") ?? false;
  // An operator acting as a customer must see exactly the customer's navigation.
  const isActingForChild = !!managedProfile;
  const isManager = !!managedProfiles.data?.manager;
  const managerCheckFailed = managedProfiles.isError && !isManagedProfilesAccessDenied(managedProfiles.error);
  const navItems = isActingForChild
    ? CHILD_NAV_ITEMS
    : [
        ...NAV_ITEMS,
        ...(isManager ? [MANAGED_PROFILES_NAV_ITEM] : []),
        ...(isAdmin && !isImpersonating ? [ADMIN_NAV_ITEM] : [])
      ];

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
              {managerCheckFailed && !isActingForChild && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    disabled={managedProfiles.isFetching}
                    onClick={() => managedProfiles.refetch()}
                    tooltip="Retry managed profile access check"
                    type="button"
                  >
                    <RefreshCw className={managedProfiles.isFetching ? "animate-spin" : undefined} />
                    <span>Retry profile access</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
