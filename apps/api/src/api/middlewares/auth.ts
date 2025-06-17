import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import { validateSignatureAndGetMemo } from "../services/siwe.service";

declare module "express-serve-static-core" {
  interface Request {
    derivedMemo: string | null;
  }
}

async function getMemoFromCookiesMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  // If the client didn't specify, we don't want to pass a derived memo even if a cookie was sent.

  req.derivedMemo = null; // Explicit overwrite to avoid tampering, defensive.

  if (!req.body.usesMemo) {
    next();
    return;
  }

  try {
    const {
      cookies,
      body: { address }
    } = req;

    const cookieKey = `authToken_${address}`;
    const authToken = cookies[cookieKey];

    // Check if matches the address requested by client, otherwise ignore cookie
    if (!authToken?.signature || !authToken?.nonce) {
      res.status(httpStatus.UNAUTHORIZED).json({
        error: "Missing or invalid authentication token"
      });
      return;
    }

    const memo = await validateSignatureAndGetMemo(authToken.nonce, authToken.signature);

    // Client declared usage of memo, but it could not be derived from provided signatures
    if (!memo) {
      res.status(httpStatus.UNAUTHORIZED).json({
        error: "Missing or invalid authentication token"
      });
      return;
    }

    req.derivedMemo = memo;
    next();
  } catch (error) {
    const err = error as Error;
    // Distinguish between failed signature check and other errors
    if (err.message.includes("Could not verify signature")) {
      res.status(httpStatus.UNAUTHORIZED).json({
        error: "Signature validation failed.",
        details: err.message
      });
      return;
    }

    console.error(`Error in getMemoFromCookiesMiddleware: ${err.message}`);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      error: "Error while verifying signature",
      details: err.message
    });
  }
}

export { getMemoFromCookiesMiddleware };
