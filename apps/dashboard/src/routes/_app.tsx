import { createFileRoute, Navigate, Outlet, useRouterState } from "@tanstack/react-router";
import { motion } from "motion/react";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { Topbar } from "@/components/layout/Topbar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { useAuthStore } from "@/stores/auth.store";

export const Route = createFileRoute("/_app")({
  component: AppLayout
});

function AppLayout() {
  const user = useAuthStore(state => state.user);
  const pathname = useRouterState({ select: state => state.location.pathname });

  if (!user) {
    return <Navigate to="/login" />;
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <Topbar />
        {/* Re-key on pathname so each navigation cross-fades the page content in. */}
        <motion.div
          animate={{ opacity: 1 }}
          className="flex-1 p-4 md:p-6"
          initial={{ opacity: 0 }}
          key={pathname}
          transition={{ duration: 0.2, ease: "easeOut" }}
        >
          <Outlet />
        </motion.div>
      </SidebarInset>
    </SidebarProvider>
  );
}
