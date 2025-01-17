import { Request, Response, NextFunction } from 'express';
import { validateSignatureAndGetMemo } from '../services/siwe.service';

declare global {
  namespace Express {
    interface Request {
      derivedMemo: string | null;
    }
  }
}

async function getMemoFromCookiesMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  req.derivedMemo = null;

  if (!req.body.usesMemo) {
    next();
    return;
  }

  try {
    const {
      cookies,
      body: { address },
    } = req;

    const cookieKey = `authToken_${address}`;
    const authToken = cookies[cookieKey];

    if (!authToken?.signature || !authToken?.nonce) {
      res.status(401).json({
        error: 'Missing or invalid authentication token',
      });
      return;
    }

    const memo = await validateSignatureAndGetMemo(authToken.nonce, authToken.signature);

    if (!memo) {
      res.status(401).json({
        error: 'Missing or invalid authentication token',
      });
      return;
    }

    req.derivedMemo = memo;
    next();
  } catch (error) {
    const err = error as Error;
    if (err.message.includes('Could not verify signature')) {
      res.status(401).json({
        error: 'Signature validation failed.',
        details: err.message,
      });
      return;
    }

    console.error(`Error in getMemoFromCookiesMiddleware: ${err.message}`);
    res.status(500).json({
      error: 'Error while verifying signature',
      details: err.message,
    });
    return;
  }
}

export { getMemoFromCookiesMiddleware };
