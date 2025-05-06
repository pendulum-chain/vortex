import { RequestHandler } from 'express';
import httpStatus from 'http-status';

import { PriceEndpoints } from 'shared/src/endpoints/price.endpoints';
import * as alchemyPayService from '../services/alchemypay/alchemypay.service';
import { AlchemyPayPrice } from '../services/alchemypay/alchemypay.service';
import * as transakService from '../services/transak.service';
import { TransakPriceResult } from '../services/transak.service';
import * as moonpayService from '../services/moonpay.service';
import { MoonpayPrice } from '../services/moonpay.service';
import { PriceQuery } from '../middlewares/validators';
import {
  InvalidAmountError,
  InvalidParameterError,
  ProviderApiError,
  ProviderInternalError,
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
  alchemypay: async (fromCrypto, toFiat, amount, network) =>
    alchemyPayService.getPriceFor(fromCrypto, toFiat, amount, network),
  moonpay: async (fromCrypto, toFiat, amount) => moonpayService.getPriceFor(fromCrypto, toFiat, amount),
  transak: async (fromCrypto, toFiat, amount, network) =>
    transakService.getPriceFor(fromCrypto, toFiat, amount, network),
};

const getPriceFromProvider = async (
  provider: PriceEndpoints.Provider,
  fromCrypto: PriceEndpoints.CryptoCurrency,
  toFiat: PriceEndpoints.FiatCurrency,
  amount: string,
  network?: string,
) => providerHandlers[provider](fromCrypto, toFiat, amount, network);

export const getPriceForProvider: RequestHandler<unknown, any, unknown, PriceQuery> = async (req, res) => {
  const { provider, fromCrypto, toFiat, amount, network } = req.query;

  if (!provider || typeof provider !== 'string') {
    res.status(httpStatus.BAD_REQUEST).json({ error: 'Invalid provider parameter' });
    return;
  }

  const providerLower = provider.toLowerCase() as PriceEndpoints.Provider;

  if (!fromCrypto || typeof fromCrypto !== 'string') {
    res.status(httpStatus.BAD_REQUEST).json({ error: 'Invalid fromCrypto parameter' });
    return;
  }

  if (!toFiat || typeof toFiat !== 'string') {
    res.status(httpStatus.BAD_REQUEST).json({ error: 'Invalid toFiat parameter' });
    return;
  }

  if (!amount || typeof amount !== 'string') {
    res.status(httpStatus.BAD_REQUEST).json({ error: 'Invalid amount parameter' });
    return;
  }

  const networkParam = network && typeof network === 'string' ? network : undefined;

  try {
    if (!providerHandlers[providerLower]) {
      res.status(httpStatus.BAD_REQUEST).json({ error: 'Invalid provider' });
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
      res.status(httpStatus.BAD_REQUEST).json({ error: err.message });
    } else if (err instanceof InvalidAmountError) {
      // 400 Bad Request: The amount is outside the provider's limits.
      res.status(httpStatus.BAD_REQUEST).json({ error: err.message });
    } else if (err instanceof InvalidParameterError) {
      // 400 Bad Request: Some other input parameter was invalid for the provider.
      res.status(httpStatus.BAD_REQUEST).json({ error: err.message });
    } else if (err instanceof ProviderInternalError) {
      // 502 Bad Gateway: The upstream provider had an internal issue. Log it.
      console.error('Provider internal error:', err);
      res.status(httpStatus.BAD_GATEWAY).json({ error: err.message });
    } else {
      console.error('Unexpected server error:', err);
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ error: 'An internal server error occurred while fetching the price.' });
    }
  }
};

export const getAllPricesBundled: RequestHandler<
  Record<string, never>,
  PriceEndpoints.AllPricesResponse | { error: string },
  Record<string, never>,
  PriceQuery
> = async (req, res) => {
  const { fromCrypto, toFiat, amount, network } = req.query;

  // Input validation is handled by the middleware, but we need to ensure
  // the parameters are correctly typed for the service calls
  if (!fromCrypto || typeof fromCrypto !== 'string') {
    res.status(httpStatus.BAD_REQUEST).json({ error: 'Invalid fromCrypto parameter' });
    return;
  }

  if (!toFiat || typeof toFiat !== 'string') {
    res.status(httpStatus.BAD_REQUEST).json({ error: 'Invalid toFiat parameter' });
    return;
  }

  if (!amount || typeof amount !== 'string') {
    res.status(httpStatus.BAD_REQUEST).json({ error: 'Invalid amount parameter' });
    return;
  }

  const crypto = fromCrypto.toLowerCase() as PriceEndpoints.CryptoCurrency;
  const fiat = toFiat.toLowerCase() as PriceEndpoints.FiatCurrency;
  const networkParam = network && typeof network === 'string' ? network : undefined;

  const providersToQuery: PriceEndpoints.Provider[] = ['alchemypay', 'moonpay', 'transak'];

  const pricePromises = providersToQuery.map(async (provider) => {
    try {
      const price = await getPriceFromProvider(provider, crypto, fiat, amount, networkParam);
      // Return a consistent structure including the provider for easier mapping later
      return { provider, status: 'fulfilled', value: price } as const;
    } catch (err) {
      // Catch errors here and return a rejected structure with the error
      return { provider, status: 'rejected', reason: err } as const;
    }
  });

  // Use Promise.allSettled to wait for all promises, regardless of success/failure
  const results = await Promise.allSettled(pricePromises);

  const response: PriceEndpoints.AllPricesResponse = {};

  results.forEach((result) => {
    // Promise.allSettled itself always fulfills. We need to check the status of our *inner* promise result.
    if (result.status === 'fulfilled') {
      const { provider, status, value, reason } = result.value;

      if (status === 'fulfilled') {
        response[provider] = { status: 'fulfilled', value };
      } else {
        let errorStatus = httpStatus.INTERNAL_SERVER_ERROR; // Default internal server error
        let errorMessage = 'An unexpected error occurred with this provider.';

        if (reason instanceof ProviderApiError) {
          if (reason instanceof ProviderInternalError) {
            errorStatus = httpStatus.BAD_GATEWAY; // Bad Gateway for provider internal errors
          } else if (
            reason instanceof UnsupportedPairError ||
            reason instanceof InvalidAmountError ||
            reason instanceof InvalidParameterError
          ) {
            errorStatus = httpStatus.BAD_REQUEST;
          }
          errorMessage = reason.message;
        } else if (reason instanceof Error) {
          // Generic JS Error
          errorMessage = reason.message;
          console.error(`Non-provider error for ${provider}:`, reason); // Log unexpected errors
        } else {
          // Unknown error type
          console.error(`Unknown error type for ${provider}:`, reason);
        }

        response[provider] = {
          status: 'rejected',
          reason: { message: errorMessage, status: errorStatus },
        };
      }
    } else {
      // This case indicates an issue with the Promise.allSettled structure itself or the mapping,
      // as our inner promises are designed to catch their errors.
      // Log this unexpected scenario for debugging.
      console.error('Unexpected Promise.allSettled rejection:', result.reason);
      // For now, we won't add an entry for this provider if the outer promise rejects.
    }
  });

  // Always return 200 OK with the aggregated response, even if some providers failed
  res.status(httpStatus.OK).json(response);
};
