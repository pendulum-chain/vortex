import { FiatToken, PaymentMethodConfig, PaymentMethodName, PaymentMethodType } from "@packages/shared";

const EUR = {
  id: FiatToken.EURC,
  name: "Euro",
  limits: {
    min: 10,
    max: 50000
  }
};

const BRL = {
  id: FiatToken.BRL,
  name: "Brazilian Real",
  limits: {
    min: 10,
    max: 50000
  }
};

const ARS = {
  id: FiatToken.ARS,
  name: "Argentine Peso",
  limits: {
    min: 10,
    max: 50000
  }
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
