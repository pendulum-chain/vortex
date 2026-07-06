import { RefreshTokenError, SupabaseAuthService } from "../../api/services/auth";

const TOKEN_PREFIX = "test-user:";
const REFRESH_PREFIX = "test-refresh:";
/** The one-time code the fake OTP flow accepts after sendOTP was called for the email. */
export const TEST_OTP_CODE = "123456";

/** Returns a Bearer token the fake verifier accepts for the given user id. */
export function testUserToken(userId: string, email = "user@example.com"): string {
  return `${TOKEN_PREFIX}${userId}:${email}`;
}

export interface FakeSupabaseAuth {
  /** Emails checkUserExists reports as existing accounts. */
  readonly existingEmails: Set<string>;
  /** Emails an OTP was sent to (in order). */
  readonly otpRequests: string[];
  restore: () => void;
}

/**
 * Replaces the Supabase auth surface with a local in-memory flow — no Supabase
 * calls. Tokens minted by testUserToken() are valid; the email/OTP login
 * accepts TEST_OTP_CODE for any email that requested one and mints tokens for
 * the deterministic user id `otp-user-<email>`.
 */
export function installFakeSupabaseAuth(): FakeSupabaseAuth {
  const originals = {
    checkUserExists: SupabaseAuthService.checkUserExists,
    refreshToken: SupabaseAuthService.refreshToken,
    sendOTP: SupabaseAuthService.sendOTP,
    verifyOTP: SupabaseAuthService.verifyOTP,
    verifyToken: SupabaseAuthService.verifyToken
  };

  const existingEmails = new Set<string>();
  const otpRequests: string[] = [];
  const pendingOtps = new Set<string>();
  // User ids are UUID columns; keep them stable per email across logins.
  const userIdsByEmail = new Map<string, string>();
  const userIdFor = (email: string) => {
    let id = userIdsByEmail.get(email);
    if (!id) {
      id = crypto.randomUUID();
      userIdsByEmail.set(email, id);
    }
    return id;
  };

  SupabaseAuthService.verifyToken = async (accessToken: string) => {
    if (!accessToken.startsWith(TOKEN_PREFIX)) {
      return { valid: false };
    }
    const [userId, email] = accessToken.slice(TOKEN_PREFIX.length).split(":");
    return { email, user_id: userId, valid: true };
  };

  SupabaseAuthService.checkUserExists = async (email: string) => existingEmails.has(email);

  SupabaseAuthService.sendOTP = async (email: string) => {
    otpRequests.push(email);
    pendingOtps.add(email);
  };

  SupabaseAuthService.verifyOTP = async (email: string, token: string) => {
    if (!pendingOtps.has(email) || token !== TEST_OTP_CODE) {
      throw new Error("FakeSupabaseAuth: invalid OTP");
    }
    pendingOtps.delete(email);
    existingEmails.add(email);
    const userId = userIdFor(email);
    return {
      access_token: testUserToken(userId, email),
      refresh_token: `${REFRESH_PREFIX}${userId}:${email}`,
      user_id: userId
    };
  };

  SupabaseAuthService.refreshToken = async (refreshToken: string) => {
    if (!refreshToken.startsWith(REFRESH_PREFIX)) {
      throw new RefreshTokenError("FakeSupabaseAuth: invalid refresh token", false);
    }
    const [userId, email] = refreshToken.slice(REFRESH_PREFIX.length).split(":");
    return {
      access_token: testUserToken(userId, email),
      refresh_token: `${REFRESH_PREFIX}${userId}:${email}`
    };
  };

  return {
    existingEmails,
    otpRequests,
    restore: () => {
      SupabaseAuthService.verifyToken = originals.verifyToken;
      SupabaseAuthService.checkUserExists = originals.checkUserExists;
      SupabaseAuthService.sendOTP = originals.sendOTP;
      SupabaseAuthService.verifyOTP = originals.verifyOTP;
      SupabaseAuthService.refreshToken = originals.refreshToken;
    }
  };
}
