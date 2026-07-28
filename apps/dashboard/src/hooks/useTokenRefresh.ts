import { useEffect } from "react";
import { AuthService } from "@/services/auth";
import { startTokenRefresh } from "@/services/tokenRefresh";
import { useAuthStore } from "@/stores/auth.store";

export function useTokenRefresh(): void {
  const user = useAuthStore(state => state.user);
  const logout = useAuthStore(state => state.logout);

  useEffect(() => {
    if (!user) return;

    return startTokenRefresh({
      getExpiryMs: () => AuthService.getAccessTokenExpiryMs(),
      onInvalid: logout,
      refresh: () => AuthService.refreshAccessToken()
    });
  }, [logout, user]);
}
