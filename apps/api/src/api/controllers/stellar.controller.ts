import { NextFunction, Request, Response } from 'express';
import httpStatus from 'http-status';
import { Keypair } from 'stellar-sdk';

import {
  CreateStellarTransactionRequest,
  CreateStellarTransactionResponse,
  GetSep10MasterPKResponse,
  SignSep10ChallengeRequest,
  SignSep10ChallengeResponse,
  StellarErrorResponse,
} from '@packages/shared';
import { FUNDING_SECRET, SEP10_MASTER_SECRET, STELLAR_FUNDING_AMOUNT_UNITS } from '../../constants/constants';
import { signSep10Challenge } from '../services/sep10/sep10.service';
import { SlackNotifier } from '../services/slack.service';
import { buildCreationStellarTx, horizonServer } from '../services/stellar.service';

const FUNDING_PUBLIC_KEY = FUNDING_SECRET ? Keypair.fromSecret(FUNDING_SECRET).publicKey() : '';

export const createStellarTransactionHandler = async (
  req: Request<unknown, unknown, CreateStellarTransactionRequest>,
  res: Response<CreateStellarTransactionResponse | StellarErrorResponse>,
  _next: NextFunction,
): Promise<void> => {
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
    res.json({ signature, sequence, public: FUNDING_PUBLIC_KEY });
    return;
  } catch (error) {
    console.error('Error in createStellarTransaction:', error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to create transaction',
      details: (error as Error).message,
    });
  }
};

export const signSep10ChallengeHandler = async (
  req: Request<unknown, unknown, SignSep10ChallengeRequest>,
  res: Response<SignSep10ChallengeResponse | StellarErrorResponse>,
  _next: NextFunction,
): Promise<void> => {
  try {
    const { masterClientSignature, masterClientPublic, clientSignature, clientPublic } = await signSep10Challenge(
      req.body.challengeXDR,
      req.body.outToken,
      req.body.clientPublicKey,
      req.derivedMemo,
    );
    res.json({
      masterClientSignature: masterClientSignature ?? '',
      masterClientPublic: masterClientPublic ?? '',
      clientSignature: clientSignature ?? '',
      clientPublic: clientPublic ?? '',
    });
    return;
  } catch (error) {
    console.error('Error in signSep10Challenge:', error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to sign challenge',
      details: (error as Error).message,
    });
  }
};

export const getSep10MasterPKHandler = async (
  _: Request,
  res: Response<GetSep10MasterPKResponse | StellarErrorResponse>,
  _next: NextFunction,
): Promise<void> => {
  try {
    if (!SEP10_MASTER_SECRET) {
      throw new Error('SEP10_MASTER_SECRET is not configured');
    }
    const masterSep10Public = Keypair.fromSecret(SEP10_MASTER_SECRET).publicKey();
    res.json({ masterSep10Public });
    return;
  } catch (error) {
    console.error('Error in getSep10MasterPK:', error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to get master public key',
      details: (error as Error).message,
    });
  }
};

interface StatusResult {
  status: boolean;
  public: string;
}

export async function sendStatusWithPk(): Promise<StatusResult> {
  const slackNotifier = new SlackNotifier();

  try {
    const account = await horizonServer.loadAccount(FUNDING_PUBLIC_KEY);
    const stellarBalance = account.balances.find(
      (balance: { asset_type: string; balance: string }) => balance.asset_type === 'native',
    );

    if (!stellarBalance || Number(stellarBalance.balance) < Number(STELLAR_FUNDING_AMOUNT_UNITS)) {
      await slackNotifier.sendMessage({
        text: `Current balance of funding account is ${
          stellarBalance?.balance ?? 0
        } XLM please charge the account ${FUNDING_PUBLIC_KEY}.`,
      });
      return { status: false, public: FUNDING_PUBLIC_KEY };
    }

    return { status: true, public: FUNDING_PUBLIC_KEY };
  } catch (error) {
    console.error("Couldn't load Stellar account:", error);
    return { status: false, public: FUNDING_PUBLIC_KEY };
  }
}
