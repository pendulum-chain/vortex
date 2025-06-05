import { Request, Response, NextFunction } from 'express';
import httpStatus from 'http-status';
import {
  FiatToken,
  GetSupportedPaymentMethodsRequest,
  GetSupportedPaymentMethodsResponse,
  PaymentMethodConfig,
  PaymentMethodType,
  PaymentMethodTypes,
} from 'shared';
import { PAYMENT_METHODS_CONFIG } from '../../config/payment-methods.config';
import { APIError } from '../errors/api-error';

/**
 * Gets payment methods based on type (buy/sell)
 * @param type - Payment method type "sell" (default) or "buy"
 * @returns Payment methods for the specified type
 */
function getPaymentMethodsByType(type: PaymentMethodType): PaymentMethodConfig[] {
  return type === PaymentMethodTypes.BUY ? PAYMENT_METHODS_CONFIG.buy : PAYMENT_METHODS_CONFIG.sell;
}

/**
 * Filters payment methods by supported fiat currency
 * @param paymentMethods - Array of payment methods to filter
 * @param fiat - Fiat currency to filter by
 * @returns Filtered payment methods that support the specified fiat
 */
function getPaymentMethodsByFiat(paymentMethods: PaymentMethodConfig[], fiat: FiatToken): PaymentMethodConfig[] {
  return paymentMethods.filter((method) => method.supportedFiats.includes(fiat));
}

export const getSupportedPaymentMethods = async (
  req: Request<unknown, unknown, unknown, GetSupportedPaymentMethodsRequest>,
  res: Response<GetSupportedPaymentMethodsResponse | { error: string }>,
  next: NextFunction,
): Promise<void> => {
  try {
    const { type, fiat } = req.query;

    if (type && !Object.values(PaymentMethodTypes).includes(type as PaymentMethodTypes)) {
      res.status(httpStatus.BAD_REQUEST).json({
        error: `Invalid type: '${type}'. Supported types are: '${Object.values(PaymentMethodTypes).join("', '")}'`,
      });
      return;
    }

    if (fiat && !Object.values(FiatToken).includes(fiat)) {
      res.status(httpStatus.BAD_REQUEST).json({
        error: `Invalid fiat: '${fiat}'. Supported fiats are: '${Object.values(FiatToken).join("', '")}'`,
      });
      return;
    }

    const paymentMethodsByType = getPaymentMethodsByType(type);
    const paymentMethodsByFiat = getPaymentMethodsByFiat(paymentMethodsByType, fiat);

    res.status(httpStatus.OK).json({
      paymentMethods: fiat ? paymentMethodsByFiat : paymentMethodsByType,
    });
  } catch (error) {
    if (error instanceof APIError) {
      res.status(httpStatus.BAD_REQUEST).json({
        error: error.message,
      });
      return;
    }
    next(error);
  }
};
