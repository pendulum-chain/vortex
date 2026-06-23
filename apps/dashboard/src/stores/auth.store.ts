import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AuthUser {
  name: string;
  email: string;
}

interface AuthState {
  user: AuthUser | null;
  login: (email: string) => void;
  logout: () => void;
}

/** Fake auth — accepts any email and derives a display name from it. */
export const useAuthStore = create<AuthState>()(
  persist(
    set => ({
      login: email => {
        const handle = email.split("@")[0] ?? "user";
        const name = handle
          .split(/[.\-_]/)
          .filter(Boolean)
          .map(part => part.charAt(0).toUpperCase() + part.slice(1))
          .join(" ");
        set({ user: { email, name: name || "Vortex User" } });
      },
      logout: () => set({ user: null }),
      user: null
    }),
    { name: "vortex-dashboard-auth" }
  )
);
