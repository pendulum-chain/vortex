import {
  AlchemyPayPriceResponse,
  AllPricesResponse,
  Currency,
  MoonpayPriceResponse,
  Networks,
  PriceProvider,
  RampDirection,
  TransakPriceResponse
} from "@vortexfi/shared";
import { RequestHandler } from "express";
import httpStatus from "http-status";

import {
  InvalidAmountError,
  InvalidParameterError,
  ProviderApiError,
  ProviderInternalError,
  UnsupportedPairError
} from "../errors/providerErrors";
import { PriceQuery } from "../middlewares/validators";
import * as alchemyPayService from "../services/alchemypay/alchemypay.service";
import * as moonpayService from "../services/moonpay/moonpay.service";
import * as transakService from "../services/transak/transak.service";

type AnyPrice = AlchemyPayPriceResponse | MoonpayPriceResponse | TransakPriceResponse;

type PriceHandler = (
  sourceCurrency: Currency,
  targetCurrency: Currency,
  amount: string,
  direction: RampDirection,
  network?: Networks
) => Promise<AnyPrice>;

const providerHandlers: Record<PriceProvider, PriceHandler> = {
  alchemypay: async (sourceCurrency, targetCurrency, amount, direction, network) =>
    alchemyPayService.getPriceFor(sourceCurrency, targetCurrency, amount, direction, network),
  moonpay: async (sourceCurrency, targetCurrency, amount, direction) =>
    moonpayService.getPriceFor(sourceCurrency, targetCurrency, amount, direction),
  transak: async (sourceCurrency, targetCurrency, amount, direction, network) =>
    transakService.getPriceFor(sourceCurrency, targetCurrency, amount, direction, network)
};

const getPriceFromProvider = async (
  provider: PriceProvider,
  sourceCurrency: Currency,
  targetCurrency: Currency,
  amount: string,
  direction: RampDirection,
  network?: Networks
) => providerHandlers[provider](sourceCurrency, targetCurrency, amount, direction, network);

export const getPriceForProvider: RequestHandler<unknown, unknown, unknown, PriceQuery> = async (req, res) => {
  const { provider, sourceCurrency, targetCurrency, amount, network, direction } = req.query;

  if (!provider || typeof provider !== "string") {
    res.status(httpStatus.BAD_REQUEST).json({ error: "Invalid provider parameter" });
    return;
  }

  const providerLower = provider.toLowerCase() as PriceProvider;

  if (!sourceCurrency || typeof sourceCurrency !== "string") {
    res.status(httpStatus.BAD_REQUEST).json({ error: "Invalid sourceCurrency parameter" });
    return;
  }

  if (!targetCurrency || typeof targetCurrency !== "string") {
    res.status(httpStatus.BAD_REQUEST).json({ error: "Invalid targetCurrency parameter" });
    return;
  }

  if (!amount || typeof amount !== "string") {
    res.status(httpStatus.BAD_REQUEST).json({ error: "Invalid amount parameter" });
    return;
  }

  const networkParam = network && typeof network === "string" ? network : undefined;

  try {
    if (!providerHandlers[providerLower]) {
      res.status(httpStatus.BAD_REQUEST).json({ error: "Invalid provider" });
      return;
    }

    const price = await getPriceFromProvider(
      providerLower,
      sourceCurrency as Currency,
      targetCurrency as Currency,
      amount,
      direction,
      networkParam as Networks | undefined
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
      console.error("Provider internal error:", err);
      res.status(httpStatus.BAD_GATEWAY).json({ error: err.message });
    } else {
      console.error("Unexpected server error:", err);
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
        error: "An internal server error occurred while fetching the price."
      });
    }
  }
};

export const getAllPricesBundled: RequestHandler<
  Record<string, never>,
  AllPricesResponse | { error: string },
  Record<string, never>,
  PriceQuery
> = async (req, res) => {
  const { sourceCurrency, targetCurrency, amount, network, direction } = req.query;

  // Input validation is handled by the middleware, but we need to ensure
  // the parameters are correctly typed for the service calls
  if (!sourceCurrency || typeof sourceCurrency !== "string") {
    res.status(httpStatus.BAD_REQUEST).json({ error: "Invalid sourceCurrency parameter" });
    return;
  }

  if (!targetCurrency || typeof targetCurrency !== "string") {
    res.status(httpStatus.BAD_REQUEST).json({ error: "Invalid targetCurrency parameter" });
    return;
  }

  if (!amount || typeof amount !== "string") {
    res.status(httpStatus.BAD_REQUEST).json({ error: "Invalid amount parameter" });
    return;
  }

  const source = sourceCurrency as Currency;
  const target = targetCurrency as Currency;
  const networkParam = network && typeof network === "string" ? network : undefined;

  const providersToQuery: PriceProvider[] = ["alchemypay", "moonpay", "transak"];

  const pricePromises = providersToQuery.map(async provider => {
    try {
      const price = await getPriceFromProvider(
        provider,
        source,
        target,
        amount,
        direction,
        networkParam as Networks | undefined
      );
      // Return a consistent structure including the provider for easier mapping later
      return { provider, status: "fulfilled", value: price } as const;
    } catch (err) {
      // Catch errors here and return a rejected structure with the error
      return { provider, reason: err, status: "rejected" } as const;
    }
  });

  // Use Promise.allSettled to wait for all promises, regardless of success/failure
  const results = await Promise.allSettled(pricePromises);

  const response: AllPricesResponse = {};

  results.forEach(result => {
    // Promise.allSettled itself always fulfills. We need to check the status of our *inner* promise result.
    if (result.status === "fulfilled") {
      const { provider, status, value, reason } = result.value;

      if (status === "fulfilled") {
        response[provider] = { status: "fulfilled", value };
      } else {
        let errorStatus: number = httpStatus.INTERNAL_SERVER_ERROR; // Default internal server error
        let errorMessage = "An unexpected error occurred with this provider.";

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
          reason: { message: errorMessage, status: errorStatus },
          status: "rejected"
        };
      }
    } else {
      // This case indicates an issue with the Promise.allSettled structure itself or the mapping,
      // as our inner promises are designed to catch their errors.
      // Log this unexpected scenario for debugging.
      console.error("Unexpected Promise.allSettled rejection:", result.reason);
      // For now, we won't add an entry for this provider if the outer promise rejects.
    }
  });

  // Always return 200 OK with the aggregated response, even if some providers failed
  res.status(httpStatus.OK).json(response);
};
