import { SupabaseAuthService } from "../../api/services/auth";

const TOKEN_PREFIX = "test-user:";

/** Returns a Bearer token the fake verifier accepts for the given user id. */
export function testUserToken(userId: string, email = "user@example.com"): string {
  return `${TOKEN_PREFIX}${userId}:${email}`;
}

/**
 * Replaces Supabase token verification with a local parser: tokens minted by
 * testUserToken() are valid, everything else is rejected. No Supabase calls.
 */
export function installFakeSupabaseAuth(): { restore: () => void } {
  const original = SupabaseAuthService.verifyToken;

  SupabaseAuthService.verifyToken = async (accessToken: string) => {
    if (!accessToken.startsWith(TOKEN_PREFIX)) {
      return { valid: false };
    }
    const [userId, email] = accessToken.slice(TOKEN_PREFIX.length).split(":");
    return { email, user_id: userId, valid: true };
  };

  return {
    restore: () => {
      SupabaseAuthService.verifyToken = original;
    }
  };
}
