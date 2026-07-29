import type { AuthTokens } from "./auth";

interface SessionRestoreOptions {
  refresh: () => Promise<AuthTokens | null>;
  tokens: AuthTokens | null;
  verify: (accessToken: string) => Promise<{ valid: boolean; userId?: string }>;
}

export async function restoreAuthSession({ refresh, tokens, verify }: SessionRestoreOptions): Promise<AuthTokens | null> {
  if (!tokens) return null;

  try {
    const result = await verify(tokens.accessToken);
    if (result.valid && result.userId) {
      return { ...tokens, userId: result.userId };
    }
  } catch {
    // Verification failure may be an expired token or a transient request failure; try refresh.
  }

  try {
    return await refresh();
  } catch {
    // Preserve the session on transient failures so request-level recovery can retry later.
    return tokens;
  }
}
