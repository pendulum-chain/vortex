import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router";
import { Skeleton } from "@/components/ui/skeleton";
import { useOnboardingStatusQuery } from "@/hooks/useApprovedCorridors";

export const Route = createFileRoute("/_app/admin")({
  component: AdminLayout
});

/** Role guard shared by the account list and every `/admin/$profileId` detail route. */
function AdminLayout() {
  const onboardingStatus = useOnboardingStatusQuery();
  const isAdmin = onboardingStatus.data?.roles.includes("vortex_admin") ?? false;

  if (onboardingStatus.isLoading) {
    return <Skeleton className="mx-auto mt-20 h-80 max-w-3xl" />;
  }
  if (!isAdmin) {
    return <Navigate to="/overview" />;
  }
  return <Outlet />;
}
