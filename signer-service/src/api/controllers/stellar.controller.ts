import { Request, Response, NextFunction } from 'express';
import { Keypair } from 'stellar-sdk';

import { FUNDING_SECRET, SEP10_MASTER_SECRET } from '../../constants/constants';
import { OutputTokenType } from './../../../../src/constants/tokenConfig';
import { signSep10Challenge } from '../services/sep10/sep10.service';
import {
  buildCreationStellarTx,
  buildPaymentAndMergeTx,
  sendStatusWithPk,
  PaymentData,
} from '../services/stellar.service';

const FUNDING_PUBLIC_KEY = FUNDING_SECRET ? Keypair.fromSecret(FUNDING_SECRET).publicKey() : '';

interface CreateTxRequest {
  accountId: string;
  maxTime: number;
  assetCode: string;
  baseFee: string;
}

interface ChangeOpRequest extends CreateTxRequest {
  sequence: string;
  paymentData: PaymentData;
}

interface Sep10Request {
  challengeXDR: string;
  outToken: OutputTokenType;
  clientPublicKey: string;
  derivedMemo: string;
}

export const sendStatusWithPkHandler = async (_: Request, res: Response, next: NextFunction) => {
  try {
    const result = await sendStatusWithPk();
    return res.json(result);
  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ error: 'Server error', details: (error as Error).message });
  }
};

export const createStellarTransactionHandler = async (
  req: Request<{}, {}, CreateTxRequest>,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!FUNDING_SECRET) {
      throw new Error('FUNDING_SECRET is not configured');
    }
    const { signature, sequence } = await buildCreationStellarTx(
      FUNDING_SECRET,
      req.body.accountId,
      req.body.maxTime,
      req.body.assetCode,
      req.body.baseFee,
    );
    return res.json({ signature, sequence, public: FUNDING_PUBLIC_KEY });
  } catch (error) {
    console.error('Error in createStellarTransaction:', error);
    return res.status(500).json({ error: 'Failed to create transaction', details: (error as Error).message });
  }
};

export const changeOpTransactionHandler = async (
  req: Request<{}, {}, ChangeOpRequest>,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!FUNDING_SECRET) {
      throw new Error('FUNDING_SECRET is not configured');
    }
    const { signature } = await buildPaymentAndMergeTx(
      FUNDING_SECRET,
      req.body.accountId,
      req.body.sequence,
      req.body.paymentData,
      req.body.maxTime,
      req.body.assetCode,
      req.body.baseFee,
    );
    return res.json({ signature, public: FUNDING_PUBLIC_KEY });
  } catch (error) {
    console.error('Error in changeOpTransaction:', error);
    return res.status(500).json({ error: 'Failed to process transaction', details: (error as Error).message });
  }
};

export const signSep10ChallengeHandler = async (
  req: Request<{}, {}, Sep10Request>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { masterClientSignature, masterClientPublic, clientSignature, clientPublic } = await signSep10Challenge(
      req.body.challengeXDR,
      req.body.outToken,
      req.body.clientPublicKey,
      req.body.derivedMemo,
    );
    return res.json({ masterClientSignature, masterClientPublic, clientSignature, clientPublic });
  } catch (error) {
    console.error('Error in signSep10Challenge:', error);
    return res.status(500).json({ error: 'Failed to sign challenge', details: (error as Error).message });
  }
};

export const getSep10MasterPKHandler = async (_: Request, res: Response, next: NextFunction) => {
  try {
    if (!SEP10_MASTER_SECRET) {
      throw new Error('SEP10_MASTER_SECRET is not configured');
    }
    const masterSep10Public = Keypair.fromSecret(SEP10_MASTER_SECRET).publicKey();
    return res.json({ masterSep10Public });
  } catch (error) {
    console.error('Error in getSep10MasterPK:', error);
    return res.status(500).json({ error: 'Failed to get master public key', details: (error as Error).message });
  }
};
