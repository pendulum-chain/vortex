import { NextFunction, Request, Response } from "express";

type RequestLike = Pick<Request, "credential" | "userId">;

/**
 * Returns the effective user identity for a request.
 *
 * Order of preference: Supabase-authenticated user (`req.userId`) first, then the
 * canonical profile resolved during API credential validation. Returns `undefined`
 * for fully anonymous requests.
 *
 */
export function getEffectiveUserId(req: RequestLike): string | undefined {
  return req.userId ?? req.credential?.profileId;
}

export type EffectiveUserRequest = Request;
export type EffectiveUserMiddleware = (req: Request, res: Response, next: NextFunction) => void;
