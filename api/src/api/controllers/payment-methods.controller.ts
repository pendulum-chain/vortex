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
  res: Response<GetSupportedPaymentMethodsResponse>,
  next: NextFunction,
): Promise<void> => {
  try {
    const { type, fiat } = req.query;
    const paymentMethodsByType = getPaymentMethodsByType(type);
    const paymentMethodsByFiat = getPaymentMethodsByFiat(paymentMethodsByType, fiat);

    res.status(httpStatus.OK).json({
      paymentMethods: fiat ? paymentMethodsByFiat : paymentMethodsByType,
    });
  } catch (error) {
    next(error);
  }
};
