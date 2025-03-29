import { Request, Response, RequestHandler } from 'express';

import * as alchemyPayService from '../services/alchemypay/alchemypay.service';
import * as transakService from '../services/transak.service';
import * as moonpayService from '../services/moonpay.service';
import { MoonpayPrice } from '../services/moonpay.service';
import { AlchemyPayPrice } from '../services/alchemypay/alchemypay.service';
import { TransakPriceResult } from '../services/transak.service';
import { PriceEndpoints } from 'shared/src/endpoints/price.endpoints';
import { PriceQuery } from '../middlewares/validators';

type AnyPrice = AlchemyPayPrice | MoonpayPrice | TransakPriceResult;

type PriceHandler = (
  fromCrypto: PriceEndpoints.CryptoCurrency,
  toFiat: PriceEndpoints.FiatCurrency,
  amount: string,
  network?: string,
) => Promise<AnyPrice>;

const providerHandlers: Record<PriceEndpoints.Provider, PriceHandler> = {
  alchemypay: async (fromCrypto, toFiat, amount, network) => {
    try {
      return await alchemyPayService.getPriceFor(fromCrypto, toFiat, amount, network);
    } catch (err) {
      // AlchemyPay's errors are not very descriptive, so we just return a generic error message
      const error = err as Error;
      throw new Error(`Could not get price from AlchemyPay: ${error.message}`);
    }
  },
  moonpay: async (fromCrypto, toFiat, amount) => {
    try {
      return await moonpayService.getPriceFor(fromCrypto, toFiat, amount);
    } catch (err) {
      const error = err as Error;
      throw error.message === 'Token not supported'
        ? error
        : new Error(`Could not get price from Moonpay: ${error.message}`);
    }
  },
  transak: async (fromCrypto, toFiat, amount, network) => {
    try {
      return await transakService.getPriceFor(fromCrypto, toFiat, amount, network);
    } catch (err) {
      const error = err as Error;
      throw error.message === 'Token not supported'
        ? error
        : new Error(`Could not get price from Transak: ${error.message}`);
    }
  },
};

const getPriceFromProvider = async (
  provider: PriceEndpoints.Provider,
  fromCrypto: PriceEndpoints.CryptoCurrency,
  toFiat: PriceEndpoints.FiatCurrency,
  amount: string,
  network?: string,
) => {
  return await providerHandlers[provider](fromCrypto, toFiat, amount, network);
};

export const getPriceForProvider: RequestHandler<unknown, any, unknown, PriceQuery> = async (req, res) => {
  const { provider, fromCrypto, toFiat, amount, network } = req.query;

  if (!provider || typeof provider !== 'string') {
    res.status(400).json({ error: 'Invalid provider parameter' });
    return;
  }

  const providerLower = provider.toLowerCase() as PriceEndpoints.Provider;

  if (!fromCrypto || typeof fromCrypto !== 'string') {
    res.status(400).json({ error: 'Invalid fromCrypto parameter' });
    return;
  }

  if (!toFiat || typeof toFiat !== 'string') {
    res.status(400).json({ error: 'Invalid toFiat parameter' });
    return;
  }

  if (!amount || typeof amount !== 'string') {
    res.status(400).json({ error: 'Invalid amount parameter' });
    return;
  }

  const networkParam = network && typeof network === 'string' ? network : undefined;

  try {
    if (!providerHandlers[providerLower]) {
      res.status(400).json({ error: 'Invalid provider' });
      return;
    }

    const price = await getPriceFromProvider(
      providerLower,
      fromCrypto.toLowerCase() as PriceEndpoints.CryptoCurrency,
      toFiat.toLowerCase() as PriceEndpoints.FiatCurrency,
      amount,
      networkParam,
    );
    res.json(price);
    return;
  } catch (err) {
    const error = err as Error;
    if (error.message === 'Token not supported') {
      res.status(404).json({ error: 'Token not supported' });
      return;
    }
    console.error('Server error:', error);
    res.status(500).json({ error: error.message });
    return;
  }
};
