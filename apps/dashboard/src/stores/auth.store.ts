import { disconnect } from "wagmi/actions";
import { create } from "zustand";
import { queryClient } from "@/lib/queryClient";
import { wagmiConfig } from "@/lib/wagmi";
import { resetTransferState } from "@/machines/transferActor";
import { AuthAPI } from "@/services/api/auth.api";
import { AuthService, type AuthTokens } from "@/services/auth";
import { restoreAuthSession } from "@/services/sessionRestore";
import { useNotificationsStore } from "@/stores/notifications.store";

interface AuthUser {
  name: string;
  email: string;
  userId: string;
}

interface AuthState {
  user: AuthUser | null;
  requestOtp: (email: string) => Promise<void>;
  restoreSession: () => Promise<void>;
  verifyOtp: (email: string, code: string) => Promise<void>;
  logout: () => void;
}

function displayNameFromEmail(email: string): string {
  const handle = email.split("@")[0] ?? "user";
  const name = handle
    .split(/[.\-_]/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  return name || "Vortex User";
}

function userFromSession(): AuthUser | null {
  const tokens = AuthService.getTokens();
  if (!tokens || !AuthService.isAuthenticated()) {
    return null;
  }
  return userFromTokens(tokens);
}

function userFromTokens(tokens: AuthTokens): AuthUser {
  const email = tokens.userEmail ?? "";
  return { email, name: displayNameFromEmail(email), userId: tokens.userId };
}

export function clearAccountState(): void {
  queryClient.clear();
  useNotificationsStore.getState().clear();
  resetTransferState();
  void disconnect(wagmiConfig);
}

/** Real Supabase OTP auth against /v1/auth/*; the session lives in AuthService storage. */
export const useAuthStore = create<AuthState>()(set => ({
  logout: () => {
    AuthService.signOut();
    clearAccountState();
    set({ user: null });
  },
  requestOtp: async email => {
    await AuthAPI.requestOTP(email);
  },
  restoreSession: async () => {
    const tokens = await restoreAuthSession({
      refresh: () => AuthService.refreshAccessToken(),
      tokens: AuthService.getTokens(),
      verify: accessToken => AuthAPI.verifyToken(accessToken)
    });
    set({ user: tokens ? userFromTokens(tokens) : null });
  },
  user: userFromSession(),
  verifyOtp: async (email, code) => {
    const result = await AuthAPI.verifyOTP(email, code);
    clearAccountState();
    AuthService.clearImpersonationSession();
    AuthService.storeTokens({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      userEmail: email,
      userId: result.userId
    });
    set({ user: { email, name: displayNameFromEmail(email), userId: result.userId } });
  }
}));
