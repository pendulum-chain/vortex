import { Request, Response } from 'express';
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

export const sendSiweMessage = async (req: Request, res: Response<SiweResponse>): Promise<Response<SiweResponse>> => {
  const { walletAddress } = req.body;

  if (!walletAddress) {
    return res.status(400).json({ error: 'Wallet address is required' });
  }

  try {
    const { nonce } = await createAndSendNonce(walletAddress);
    return res.json({ nonce });
  } catch (error) {
    console.error('Nonce generation error:', error);
    return res.status(500).json({ error: 'Error while generating nonce' });
  }
};

export const validateSiweSignature = async (
  req: Request<{}, {}, SiweRequestBody>,
  res: Response<SiweResponse>,
): Promise<Response<SiweResponse>> => {
  const { nonce, signature, siweMessage } = req.body;

  if (!nonce || !signature || !siweMessage) {
    return res.status(400).json({ error: 'Missing required fields' });
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

    return res.status(200).json({ message: 'Signature is valid' });
  } catch (error) {
    console.error('Signature validation error:', error);

    if (error instanceof Error && error.name === 'SiweValidationError') {
      return res.status(401).json({ error: `Siwe validation error: ${error.message}` });
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ error: `Could not validate signature: ${message}` });
  }
};
