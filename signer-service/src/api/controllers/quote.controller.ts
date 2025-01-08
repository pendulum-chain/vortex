import { Request, Response, NextFunction } from 'express';

import * as alchemyPayService from '../services/alchemypay/alchemypay.service';
import * as transakService from '../services/transak.service';
import * as moonpayService from '../services/moonpay.service';

export const SUPPORTED_PROVIDERS = ['alchemypay', 'moonpay', 'transak'] as const;
export type Provider = (typeof SUPPORTED_PROVIDERS)[number];

export const SUPPORTED_CRYPTO_CURRENCIES = ['usdc', 'usdce', 'usdc.e', 'usdt'] as const;
export type CryptoCurrency = (typeof SUPPORTED_CRYPTO_CURRENCIES)[number];

export const SUPPORTED_FIAT_CURRENCIES = ['eur', 'ars'] as const;
export type FiatCurrency = (typeof SUPPORTED_FIAT_CURRENCIES)[number];

interface QuoteRequest {
  provider: Provider;
  fromCrypto: CryptoCurrency;
  toFiat: FiatCurrency;
  amount: string;
  network?: string;
}

type QuoteHandler = (
  fromCrypto: CryptoCurrency,
  toFiat: FiatCurrency,
  amount: string,
  network?: string,
) => Promise<unknown>;

const providerHandlers: Record<Provider, QuoteHandler> = {
  alchemypay: async (fromCrypto, toFiat, amount, network) => {
    try {
      return await alchemyPayService.getQuoteFor(fromCrypto, toFiat, amount, network);
    } catch (err) {
      // AlchemyPay's errors are not very descriptive, so we just return a generic error message
      const error = err as Error;
      throw new Error(`Could not get quote from AlchemyPay: ${error.message}`);
    }
  },
  moonpay: async (fromCrypto, toFiat, amount) => {
    try {
      return await moonpayService.getQuoteFor(fromCrypto, toFiat, amount);
    } catch (err) {
      const error = err as Error;
      throw error.message === 'Token not supported'
        ? error
        : new Error(`Could not get quote from Moonpay: ${error.message}`);
    }
  },
  transak: async (fromCrypto, toFiat, amount, network) => {
    try {
      return await transakService.getQuoteFor(fromCrypto, toFiat, amount, network);
    } catch (err) {
      const error = err as Error;
      throw error.message === 'Token not supported'
        ? error
        : new Error(`Could not get quote from Transak: ${error.message}`);
    }
  },
};

const getQuoteFromProvider = async (
  provider: Provider,
  fromCrypto: CryptoCurrency,
  toFiat: FiatCurrency,
  amount: string,
  network?: string,
) => {
  return await providerHandlers[provider](fromCrypto, toFiat, amount, network);
};

export const getQuoteForProvider = async (
  req: Request<{}, {}, {}, QuoteRequest>,
  res: Response,
  _next: NextFunction,
) => {
  const { provider, fromCrypto, toFiat, amount, network } = req.query;
  const providerLower = provider.toLowerCase() as Provider;

  try {
    if (!providerHandlers[providerLower]) {
      return res.status(400).json({ error: 'Invalid provider' });
    }

    const quote = await getQuoteFromProvider(providerLower, fromCrypto, toFiat, amount, network);
    return res.json(quote);
  } catch (err) {
    const error = err as Error;
    if (error.message === 'Token not supported') {
      return res.status(404).json({ error: 'Token not supported' });
    }
    console.error('Server error:', error);
    return res.status(500).json({ error: error.message });
  }
};
