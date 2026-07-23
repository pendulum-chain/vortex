import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { AuthCard } from "@/components/auth/AuthCard";
import { VortexLogo } from "@/components/layout/VortexLogo";
import { useAuthStore } from "@/stores/auth.store";

export const Route = createFileRoute("/login")({
  component: LoginPage
});

function LoginPage() {
  const user = useAuthStore(state => state.user);
  const navigate = useNavigate();

  if (user) {
    return <Navigate to="/overview" />;
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <VortexLogo />
        </div>
        <AuthCard
          description="Enter your email — we'll sign you in or create your account."
          onAuthenticated={() => navigate({ to: "/overview" })}
          title="Connect with Vortex"
        />
      </div>
    </div>
  );
}
