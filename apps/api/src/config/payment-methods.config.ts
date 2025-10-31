import { FiatToken, PaymentMethodConfig, PaymentMethodName, PaymentMethodType } from "@vortexfi/shared";

const EUR = {
  id: FiatToken.EURC,
  limits: {
    max: 50000,
    min: 10
  },
  name: "Euro"
};

const BRL = {
  id: FiatToken.BRL,
  limits: {
    max: 50000,
    min: 10
  },
  name: "Brazilian Real"
};

const ARS = {
  id: FiatToken.ARS,
  limits: {
    max: 50000,
    min: 10
  },
  name: "Argentine Peso"
};

const SEPA_PAYMENT_METHOD: PaymentMethodConfig = {
  id: "sepa",
  name: PaymentMethodName.SEPA,
  supportedFiats: [EUR]
};

const PIX_PAYMENT_METHOD: PaymentMethodConfig = {
  id: "pix",
  name: PaymentMethodName.PIX,
  supportedFiats: [BRL]
};

const CBU_PAYMENT_METHOD: PaymentMethodConfig = {
  id: "cbu",
  name: PaymentMethodName.CBU,
  supportedFiats: [ARS]
};

export const PAYMENT_METHODS_CONFIG: Record<PaymentMethodType, PaymentMethodConfig[]> = {
  buy: [PIX_PAYMENT_METHOD],
  sell: [SEPA_PAYMENT_METHOD, PIX_PAYMENT_METHOD, CBU_PAYMENT_METHOD]
};
