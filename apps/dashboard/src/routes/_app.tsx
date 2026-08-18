import { createFileRoute, Navigate, Outlet, useRouterState } from "@tanstack/react-router";
import { motion } from "motion/react";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { ImpersonationBanner } from "@/components/layout/ImpersonationBanner";
import { ManagedProfileBanner } from "@/components/layout/ManagedProfileBanner";
import { Topbar } from "@/components/layout/Topbar";
import { isChildModePathForbidden } from "@/components/managed-profiles/managed-profile-ui";
import { AccountTypeSelector } from "@/components/onboarding/AccountTypeSelector";
import { Button } from "@/components/ui/button";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { useOnboardingStatusQuery } from "@/hooks/useApprovedCorridors";
import { useAuthStore } from "@/stores/auth.store";
import { useManagedProfileSelection } from "@/stores/managed-profile.store";

export const Route = createFileRoute("/_app")({
  component: AppLayout
});

function AppLayout() {
  const user = useAuthStore(state => state.user);
  const managedProfile = useManagedProfileSelection();
  const pathname = useRouterState({ select: state => state.location.pathname });
  const { data: onboardingStatus, isError, isLoading, refetch } = useOnboardingStatusQuery(!!user);

  if (!user) {
    return <Navigate replace to="/login" />;
  }

  if (managedProfile && isChildModePathForbidden(pathname)) {
    return <Navigate replace to="/overview" />;
  }

  const requiresAccount = ["/overview", "/recipients", "/transfer", "/transactions"].includes(pathname);
  const content = requiresAccount ? (
    isLoading ? (
      <Skeleton className="mx-auto mt-20 h-80 max-w-3xl" />
    ) : isError || !onboardingStatus ? (
      <div className="mx-auto mt-20 max-w-lg space-y-4 rounded-lg border p-8 text-center">
        <div>
          <h1 className="font-semibold text-xl">Could not load your sender profile</h1>
          <p className="text-muted-foreground text-sm">Check your connection and try again.</p>
        </div>
        <Button onClick={() => refetch()} type="button">
          Try again
        </Button>
      </div>
    ) : onboardingStatus?.selectionRequired ? (
      <AccountTypeSelector />
    ) : (
      <Outlet />
    )
  ) : (
    <Outlet />
  );

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <div className="sticky top-0 z-30">
          <ImpersonationBanner />
          <ManagedProfileBanner />
          <Topbar />
        </div>
        {/* Re-key on pathname so each navigation cross-fades the page content in. */}
        <motion.div
          animate={{ opacity: 1 }}
          className="flex-1 p-4 md:p-6"
          initial={{ opacity: 0 }}
          key={pathname}
          transition={{ duration: 0.2, ease: "easeOut" }}
        >
          {content}
        </motion.div>
      </SidebarInset>
    </SidebarProvider>
  );
}
