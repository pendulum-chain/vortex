import { NextFunction, Request, Response } from 'express';
import { createAndSendNonce, verifyAndStoreSiweMessage } from '../services/siwe.service';
import { DEFAULT_LOGIN_EXPIRATION_TIME_HOURS } from '../../constants/constants';

interface SiweRequestBody {
  walletAddress?: string;
  nonce?: string;
  signature?: string;
  siweMessage?: string;
}

type SiweResponse = {
  nonce?: string;
  message?: string;
  error?: string;
};

export const sendSiweMessage = async (req: Request, res: Response<SiweResponse>): Promise<void> => {
  const { walletAddress } = req.body;

  if (!walletAddress) {
    res.status(400).json({ error: 'Wallet address is required' });
    return;
  }

  try {
    const { nonce } = await createAndSendNonce(walletAddress);
    res.json({ nonce });
    return;
  } catch (error) {
    console.error('Nonce generation error:', error);
    res.status(500).json({ error: 'Error while generating nonce' });
    return;
  }
};

export const validateSiweSignature = async (req: Request, res: Response<SiweResponse>): Promise<void> => {
  const { nonce, signature, siweMessage } = req.body;

  if (!nonce || !signature || !siweMessage) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }

  try {
    const address = await verifyAndStoreSiweMessage(nonce, signature, siweMessage);

    const token = { nonce, signature };

    res.cookie(`authToken_${address}`, token, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: DEFAULT_LOGIN_EXPIRATION_TIME_HOURS * 60 * 60 * 1000,
    });

    res.json({ message: 'Signature is valid' });
    return;
  } catch (error) {
    console.error('Signature validation error:', error);

    if (error instanceof Error && error.name === 'SiweValidationError') {
      res.status(401).json({ error: `Siwe validation error: ${error.message}` });
      return;
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: `Could not validate signature: ${message}` });
    return;
  }
};
