import { useSelector } from "@xstate/react";
import { useCallback, useEffect, useRef } from "react";
import type { ActorRefFrom } from "xstate";
import { supabase } from "../config/supabase";
import type { rampMachine } from "../machines/ramp.machine";
import { AuthService } from "../services/auth";

export function useAuthTokens(actorRef: ActorRefFrom<typeof rampMachine>) {
  const { isAuthenticated, userId, userEmail } = useSelector(actorRef, state => ({
    isAuthenticated: state.context.isAuthenticated,
    userEmail: state.context.userEmail,
    userId: state.context.userId
  }));

  // Track if we've already restored the session to avoid running multiple times
  const hasRestoredSession = useRef(false);

  // Check for tokens in URL on mount (magic link callback)
  useEffect(() => {
    const urlTokens = AuthService.handleUrlTokens();
    if (urlTokens) {
      // Use the URL tokens to set session with Supabase, then get full user details
      supabase.auth
        .setSession({
          access_token: urlTokens.accessToken,
          refresh_token: urlTokens.refreshToken
        })
        .then(({ data, error }) => {
          if (error) {
            console.error("Failed to set session from URL tokens:", error);
            return;
          }

          if (data.session) {
            const tokens = {
              accessToken: data.session.access_token,
              refreshToken: data.session.refresh_token,
              userEmail: data.session.user.email,
              userId: data.session.user.id
            };

            AuthService.storeTokens(tokens);
            actorRef.send({ tokens, type: "AUTH_SUCCESS" });

            // Clean URL
            window.history.replaceState({}, "", window.location.pathname);
          }
        });
    }
  }, [actorRef]);

  // Setup auto-refresh on mount
  useEffect(() => {
    const cleanup = AuthService.setupAutoRefresh();
    return cleanup;
  }, []);

  // Restore session from localStorage on mount
  useEffect(() => {
    // Only restore once on initial mount to avoid infinite loops
    if (!hasRestoredSession.current && !isAuthenticated) {
      const tokens = AuthService.getTokens();
      if (tokens) {
        hasRestoredSession.current = true;
        actorRef.send({
          tokens: {
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            userEmail: tokens.userEmail,
            userId: tokens.userId
          },
          type: "AUTH_SUCCESS"
        });
      }
    }
  }, [actorRef, isAuthenticated]);

  const signOut = useCallback(async () => {
    await AuthService.signOut();
    actorRef.send({ type: "RESET_RAMP" });
  }, [actorRef]);

  return {
    isAuthenticated,
    signOut,
    userEmail,
    userId
  };
}
