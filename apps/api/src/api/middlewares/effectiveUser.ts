import { NextFunction, Request, Response } from "express";

// Augment Express Request with the optional user id derived from a secret API key.
// supabaseAuth.ts already declares req.userId (Supabase) and req.userEmail.
declare global {
  // biome-ignore lint/style/noNamespace: Express request augmentation follows the existing backend pattern.
  namespace Express {
    interface Request {
      apiKeyUserId?: string;
    }
  }
}

// Use a permissive type for the helpers below: controllers and middlewares
// instantiate Express Request with narrower generics (e.g.
// `Request<unknown, unknown, unknown, MyQuery>`), but the helpers only ever
// touch `userId` / `apiKeyUserId` / `authenticatedPartner` fields. Treating
// the argument as `Pick<Request, "userId" | "apiKeyUserId">` keeps the
// call sites type-clean without forcing every consumer to widen the request
// type.
type RequestLike = Pick<Request, "userId" | "apiKeyUserId">;

/**
 * Returns the effective user identity for a request.
 *
 * Order of preference: Supabase-authenticated user (`req.userId`) first, then the
 * nullable `api_keys.user_id` resolved during secret API-key validation
 * (`req.apiKeyUserId`). Returns `undefined` for fully anonymous requests.
 *
 */
export function getEffectiveUserId(req: RequestLike): string | undefined {
  return req.userId ?? req.apiKeyUserId;
}

/**
 * Attach an `apiKeyUserId` to a request from a secret API key validation result.
 * Intended for the auth middlewares (`apiKeyAuth`, `dualAuth`) that call
 * `validateSecretApiKey`. Public API keys do not populate this field.
 */
export function setApiKeyUserId(req: Request, userId: string | null | undefined): void {
  if (userId) {
    req.apiKeyUserId = userId;
  }
}

export type EffectiveUserRequest = Request;
export type EffectiveUserMiddleware = (req: Request, res: Response, next: NextFunction) => void;
