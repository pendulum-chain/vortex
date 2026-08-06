import { NextFunction, Request, Response } from "express";

declare global {
  // biome-ignore lint/style/noNamespace: Express request augmentation follows the existing backend pattern.
  namespace Express {
    interface Request {
      authenticatedCredentialProfileId?: string;
    }
  }
}

type RequestLike = Pick<Request, "authenticatedCredentialProfileId" | "credential" | "managedProfileContext" | "userId">;

export function getAuthenticatedProfileId(
  req: Pick<RequestLike, "authenticatedCredentialProfileId" | "userId">
): string | undefined {
  return req.userId ?? req.authenticatedCredentialProfileId;
}

/**
 * Returns the effective user identity for a request.
 *
 * Order of preference: verified delegated child, Supabase-authenticated user
 * (`req.userId`), then the canonical profile resolved during API credential
 * validation. Returns `undefined` for fully anonymous requests.
 *
 */
export function getEffectiveUserId(req: RequestLike): string | undefined {
  return req.managedProfileContext?.subjectProfileId ?? req.userId ?? req.credential?.profileId;
}

export type EffectiveUserRequest = Request;
export type EffectiveUserMiddleware = (req: Request, res: Response, next: NextFunction) => void;
