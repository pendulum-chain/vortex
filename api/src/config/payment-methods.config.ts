import { FiatToken, PaymentMethodConfig, PaymentMethodName, PaymentMethodType } from 'shared';

const SEPA_PAYMENT_METHOD: PaymentMethodConfig = {
  id: 'sepa',
  name: PaymentMethodName.SEPA,
  supportedFiats: [FiatToken.EURC],
  limits: {
    min: 10,
    max: 50000,
  },
};

const PIX_PAYMENT_METHOD: PaymentMethodConfig = {
  id: 'pix',
  name: PaymentMethodName.PIX,
  supportedFiats: [FiatToken.BRL],
  limits: {
    min: 1,
    max: 500000,
  },
};

const CBU_PAYMENT_METHOD: PaymentMethodConfig = {
  id: 'cbu',
  name: PaymentMethodName.CBU,
  supportedFiats: [FiatToken.ARS],
  limits: {
    min: 1,
    max: 500000,
  },
};

export const PAYMENT_METHODS_CONFIG: Record<PaymentMethodType, PaymentMethodConfig[]> = {
  buy: [PIX_PAYMENT_METHOD],
  sell: [SEPA_PAYMENT_METHOD, PIX_PAYMENT_METHOD, CBU_PAYMENT_METHOD],
};
