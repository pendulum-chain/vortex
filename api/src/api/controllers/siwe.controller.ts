import { Request, Response } from 'express';
import { SiweMessage } from 'siwe';
import httpStatus from 'http-status';

import { SiweEndpoints } from 'shared/src/endpoints/siwe.endpoints';
import { SessionData } from '../middleware/session';
import { siweNonceService } from '../services/siwe-nonce.service';

export async function sendSiweMessage(
  req: Request<{}, {}, SiweEndpoints.GetNonceRequest>,
  res: Response<SiweEndpoints.GetNonceResponse | { error: string }>,
) {
  try {
    const { walletAddress } = req.body;
    if (!walletAddress) {
      res.status(httpStatus.BAD_REQUEST).json({ error: 'Missing wallet address' });
      return;
    }

    const nonce = await siweNonceService.generate(walletAddress);
    res.json({ nonce });
  } catch (error) {
    console.error('Error generating nonce: ', error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ error: 'Internal Server Error' });
  }
}

export async function validateSiweSignature(
  req: Request<{}, {}, SiweEndpoints.ValidateMessageRequest>,
  res: Response<SiweEndpoints.ValidateMessageResponse | { error: string }>,
) {
  try {
    const { message, signature } = req.body;
    if (!message || !signature) {
      res.status(httpStatus.BAD_REQUEST).json({
        error: 'Missing message or signature',
      });
      return;
    }

    let siweMessage: SiweMessage;
    try {
      siweMessage = new SiweMessage(message);
    } catch (error) {
      console.error('Error parsing SIWE message: ', error);
      res.status(httpStatus.BAD_REQUEST).json({
        error: 'Invalid SIWE message',
      });
      return;
    }

    try {
      if (!(await siweNonceService.validate(siweMessage.address, siweMessage.nonce, signature))) {
        throw new Error('Signature verification failed');
      }
      (req.session as SessionData).siwe = { address: siweMessage.address };
      await req.session.save();
      res.json({ success: true });
    } catch (error) {
      console.error('Error validating signature: ', error);
      res.status(httpStatus.UNAUTHORIZED).json({ error: 'Invalid signature' });
    }
  } catch (error) {
    console.error('Error processing SIWE validation: ', error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ error: 'Internal Server Error' });
  }
}
