import { EPaymentMethod, FiatToken, PaymentMethodConfig, PaymentMethodName, PaymentMethodType } from "@vortexfi/shared";

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

// USD/MXN/COP limits mirror the hardcoded AlfredPay individual-customer bounds
// (see packages/shared/src/tokens/freeTokens/config.ts), converted from raw to fiat units.
const USD = {
  id: FiatToken.USD,
  limits: {
    max: 100000,
    min: 1
  },
  name: "US Dollar"
};

const MXN = {
  id: FiatToken.MXN,
  limits: {
    max: 86952173,
    min: 150
  },
  name: "Mexican Peso"
};

const COP = {
  id: FiatToken.COP,
  limits: {
    max: 368655999,
    min: 33000
  },
  name: "Colombian Peso"
};

const SEPA_PAYMENT_METHOD: PaymentMethodConfig = {
  id: EPaymentMethod.SEPA,
  name: PaymentMethodName.SEPA,
  supportedFiats: [EUR]
};

const PIX_PAYMENT_METHOD: PaymentMethodConfig = {
  id: EPaymentMethod.PIX,
  name: PaymentMethodName.PIX,
  supportedFiats: [BRL]
};

const CBU_PAYMENT_METHOD: PaymentMethodConfig = {
  id: EPaymentMethod.CBU,
  name: PaymentMethodName.CBU,
  supportedFiats: [ARS]
};

const SPEI_PAYMENT_METHOD: PaymentMethodConfig = {
  id: EPaymentMethod.SPEI,
  name: PaymentMethodName.SPEI,
  supportedFiats: [MXN]
};

const ACH_PAYMENT_METHOD: PaymentMethodConfig = {
  id: EPaymentMethod.ACH,
  name: PaymentMethodName.ACH,
  supportedFiats: [USD, COP]
};

export const PAYMENT_METHODS_CONFIG: Record<PaymentMethodType, PaymentMethodConfig[]> = {
  buy: [PIX_PAYMENT_METHOD, ACH_PAYMENT_METHOD, SPEI_PAYMENT_METHOD],
  sell: [SEPA_PAYMENT_METHOD, PIX_PAYMENT_METHOD, CBU_PAYMENT_METHOD, ACH_PAYMENT_METHOD, SPEI_PAYMENT_METHOD]
};
