import { Request, Response, NextFunction } from 'express';
import { validateSignatureAndGetMemo } from '../services/siwe.service';

interface AuthToken {
  signature: string;
  nonce: string;
}

interface RequestWithMemo extends Request {
  derivedMemo: string | null;
  body: {
    usesMemo?: boolean;
    address: string;
  };
  cookies: {
    [key: string]: AuthToken;
  };
}

async function getMemoFromCookiesMiddleware(req: RequestWithMemo, res: Response, next: NextFunction) {
  req.derivedMemo = null;

  if (!req.body.usesMemo) {
    return next();
  }

  try {
    const {
      cookies,
      body: { address },
    } = req;

    const cookieKey = `authToken_${address}`;
    const authToken = cookies[cookieKey];

    if (!authToken?.signature || !authToken?.nonce) {
      return res.status(401).json({
        error: 'Missing or invalid authentication token',
      });
    }

    const memo = await validateSignatureAndGetMemo(authToken.nonce, authToken.signature);

    if (!memo) {
      return res.status(401).json({
        error: 'Missing or invalid authentication token',
      });
    }

    req.derivedMemo = memo;
    next();
  } catch (error) {
    const err = error as Error;
    if (err.message.includes('Could not verify signature')) {
      return res.status(401).json({
        error: 'Signature validation failed.',
        details: err.message,
      });
    }

    console.error(`Error in getMemoFromCookiesMiddleware: ${err.message}`);
    return res.status(500).json({
      error: 'Error while verifying signature',
      details: err.message,
    });
  }
}

export { getMemoFromCookiesMiddleware };
