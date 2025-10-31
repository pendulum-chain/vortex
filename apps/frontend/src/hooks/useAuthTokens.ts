import { useSelector } from "@xstate/react";
import { useCallback, useEffect } from "react";
import { supabase } from "../config/supabase";
import { useRampActor } from "../contexts/rampState";
import { AuthService } from "../services/auth";

export function useAuthTokens() {
  const rampActor = useRampActor();
  const { isAuthenticated, userId, userEmail } = useSelector(rampActor, state => ({
    isAuthenticated: state.context.isAuthenticated,
    userEmail: state.context.userEmail,
    userId: state.context.userId
  }));

  // Check for tokens in URL on mount (magic link callback)
  useEffect(() => {
    const urlTokens = AuthService.handleUrlTokens();
    if (urlTokens) {
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) {
          const tokens = {
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
            user_id: data.session.user.id
          };

          AuthService.storeTokens(tokens);
          rampActor.send({ tokens, type: "AUTH_SUCCESS" });

          // Clean URL
          window.history.replaceState({}, "", window.location.pathname);
        }
      });
    }
  }, [rampActor]);

  // Setup auto-refresh on mount
  useEffect(() => {
    const cleanup = AuthService.setupAutoRefresh();
    return cleanup;
  }, []);

  // Restore session from localStorage on mount
  useEffect(() => {
    const tokens = AuthService.getTokens();
    if (tokens && !isAuthenticated) {
      rampActor.send({
        tokens: {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          user_id: tokens.user_id
        },
        type: "AUTH_SUCCESS"
      });
    }
  }, [rampActor, isAuthenticated]);

  const signOut = useCallback(async () => {
    await AuthService.signOut();
    rampActor.send({ type: "RESET_RAMP" });
  }, [rampActor]);

  return {
    isAuthenticated,
    signOut,
    userEmail,
    userId
  };
}
