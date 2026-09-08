import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { AuthCard } from "@/components/auth/AuthCard";
import { safeLoginReturnTo } from "@/components/auth/login-return";
import { VortexLogo } from "@/components/layout/VortexLogo";
import { useAuthStore } from "@/stores/auth.store";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  validateSearch: (search: Record<string, unknown>): { returnTo?: string } => ({ returnTo: safeLoginReturnTo(search.returnTo) })
});

function LoginPage() {
  const user = useAuthStore(state => state.user);
  const navigate = useNavigate();
  const { returnTo } = Route.useSearch();

  if (user) {
    return <Navigate replace to={returnTo ?? "/overview"} />;
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <VortexLogo />
        </div>
        <AuthCard
          description="Enter your email — we'll sign you in or create your account."
          onAuthenticated={() => navigate({ replace: true, to: returnTo ?? "/overview" })}
          title="Connect with Vortex"
        />
      </div>
    </div>
  );
}
