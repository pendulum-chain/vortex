import { Keypair } from 'stellar-sdk';
import { ApiPromise, WsProvider, Keyring } from '@polkadot/api';
import Big from 'big.js';
import { Request, Response } from 'express';

import { PENDULUM_WSS, PENDULUM_FUNDING_SEED } from '../../constants/constants';
import {
  TOKEN_CONFIG,
  StellarTokenConfig,
  XCMTokenConfig,
  getPaddedAssetCode,
  isXCMTokenConfig,
} from '../../constants/tokenConfig';

interface SubsidizePreSwapRequest {
  address: string;
  amountRaw: string;
  tokenToSubsidize: string;
}

interface SubsidizePostSwapRequest {
  address: string;
  amountRaw: string;
  token: string;
}

const initializePendulum = async () => {
  const wsProvider = new WsProvider(PENDULUM_WSS);
  const api = await ApiPromise.create({ provider: wsProvider });
  await api.isReady;
  return api;
};

const getFundingAccount = () => {
  if (!PENDULUM_FUNDING_SEED) {
    throw new Error('PENDULUM_FUNDING_SEED is not configured');
  }

  const keyring = new Keyring({ type: 'sr25519' });
  return keyring.addFromUri(PENDULUM_FUNDING_SEED);
};

const validateSubsidyAmount = (amount: string, maxAmount: string) => {
  if (Big(amount).gt(Big(maxAmount))) {
    throw new Error('Amount exceeds maximum subsidy amount');
  }
};

const getPendulumCurrencyConfig = (token: string): StellarTokenConfig | XCMTokenConfig => {
  const normalizedToken = token.toLowerCase() as keyof typeof TOKEN_CONFIG;
  const config = TOKEN_CONFIG[normalizedToken];

  if (!config) {
    throw new Error(`Unsupported token: ${token}`);
  }

  return config;
};

export const subsidizePreSwap = async (req: Request<{}, {}, SubsidizePreSwapRequest>, res: Response): Promise<void> => {
  try {
    const { address, amountRaw, tokenToSubsidize } = req.body;
    console.log('Subsidize pre swap', address, amountRaw, tokenToSubsidize);

    const config = getPendulumCurrencyConfig(tokenToSubsidize);

    validateSubsidyAmount(amountRaw, config.maximumSubsidyAmountRaw);

    const fundingAccountKeypair = getFundingAccount();
    const api = await initializePendulum();

    await api.tx.tokens.transfer(address, config.pendulumCurrencyId, amountRaw).signAndSend(fundingAccountKeypair);

    res.json({ message: 'Subsidy transferred successfully' });
    return;
  } catch (error) {
    console.error('Error in subsidizePreSwap::', error);
    res.status(500).json({
      error: 'Server error',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
    return;
  }
};

export const subsidizePostSwap = async (
  req: Request<{}, {}, SubsidizePostSwapRequest>,
  res: Response,
): Promise<void> => {
  try {
    const { address, amountRaw, token } = req.body;
    console.log('Subsidize post swap', address, amountRaw, token);

    const config = getPendulumCurrencyConfig(token);

    validateSubsidyAmount(amountRaw, config.maximumSubsidyAmountRaw);

    if (isXCMTokenConfig(config)) {
      throw new Error('Token config must be a Stellar token config');
    }

    const assetIssuerHex = `0x${Keypair.fromPublicKey(config.assetIssuer).rawPublicKey().toString('hex')}`;
    const pendulumCurrencyId = {
      Stellar: {
        AlphaNum4: { code: getPaddedAssetCode(config.assetCode), issuer: assetIssuerHex },
      },
    };

    const fundingAccountKeypair = getFundingAccount();
    const api = await initializePendulum();

    await api.tx.tokens.transfer(address, pendulumCurrencyId, amountRaw).signAndSend(fundingAccountKeypair);

    res.json({ message: 'Subsidy transferred successfully' });
    return;
  } catch (error) {
    console.error('Error in subsidizePostSwap::', error);
    res.status(500).json({
      error: 'Server error',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
    return;
  }
};
