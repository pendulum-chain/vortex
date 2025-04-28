import { Request, Response, RequestHandler } from 'express';

import { PriceEndpoints } from 'shared/src/endpoints/price.endpoints';
import * as alchemyPayService from '../services/alchemypay/alchemypay.service';
import * as transakService from '../services/transak.service';
import * as moonpayService from '../services/moonpay.service';
import { MoonpayPrice } from '../services/moonpay.service';
import { AlchemyPayPrice } from '../services/alchemypay/alchemypay.service';
import { TransakPriceResult } from '../services/transak.service';
import { PriceQuery } from '../middlewares/validators';
import {
  InvalidAmountError,
  InvalidParameterError,
  ProviderInternalError,
  ProviderApiError, // Import base class for broader catch if needed
  UnsupportedPairError,
} from '../errors/providerErrors';

type AnyPrice = AlchemyPayPrice | MoonpayPrice | TransakPriceResult;

type PriceHandler = (
  fromCrypto: PriceEndpoints.CryptoCurrency,
  toFiat: PriceEndpoints.FiatCurrency,
  amount: string,
  network?: string,
) => Promise<AnyPrice>;

const providerHandlers: Record<PriceEndpoints.Provider, PriceHandler> = {
  alchemypay: async (fromCrypto, toFiat, amount, network) => {
    // Let errors from the service propagate directly
    return await alchemyPayService.getPriceFor(fromCrypto, toFiat, amount, network);
  },
  moonpay: async (fromCrypto, toFiat, amount) => {
    // Let errors from the service propagate directly
    return await moonpayService.getPriceFor(fromCrypto, toFiat, amount);
  },
  transak: async (fromCrypto, toFiat, amount, network) => {
    // Let errors from the service propagate directly
    return await transakService.getPriceFor(fromCrypto, toFiat, amount, network);
  },
};

const getPriceFromProvider = async (
  provider: PriceEndpoints.Provider,
  fromCrypto: PriceEndpoints.CryptoCurrency,
  toFiat: PriceEndpoints.FiatCurrency,
  amount: string,
  network?: string,
) => await providerHandlers[provider](fromCrypto, toFiat, amount, network);

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
    // No need for return here, res.json() ends the response.
  } catch (err) {
    if (err instanceof UnsupportedPairError) {
      // 400 Bad Request: The combination of inputs is invalid/unsupported by the provider.
      res.status(400).json({ error: err.message });
    } else if (err instanceof InvalidAmountError) {
      // 400 Bad Request: The amount is outside the provider's limits.
      res.status(400).json({ error: err.message });
    } else if (err instanceof InvalidParameterError) {
      // 400 Bad Request: Some other input parameter was invalid for the provider.
      res.status(400).json({ error: err.message });
    } else if (err instanceof ProviderInternalError) {
      // 502 Bad Gateway: The upstream provider had an internal issue. Log it.
      console.error('Provider internal error:', err);
      res.status(502).json({ error: err.message });
    } else {
      // Catch-all for unexpected errors (e.g., config errors, fetch network errors not caught in service, etc.)
      // Log the full error for internal debugging.
      console.error('Unexpected server error:', err);
      // Return a generic 500 error to the client.
      res.status(500).json({ error: 'An internal server error occurred while fetching the price.' });
    }
  }
};
