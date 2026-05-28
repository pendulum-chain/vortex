// Types re-exported used to create quotes.

import type { CreateQuoteRequest, EvmTransactionData, PaymentMethod, QuoteResponse } from "@vortexfi/shared";
import {
  EPaymentMethod,
  EphemeralAccount,
  EphemeralAccountType,
  EvmToken,
  FiatToken,
  Networks,
  PaymentData,
  RampDirection,
  RampPhase,
  UnsignedTx
} from "@vortexfi/shared";

export {
  EPaymentMethod,
  EvmToken,
  FiatToken,
  Networks,
  RampDirection,
  PaymentMethod,
  QuoteResponse,
  CreateQuoteRequest,
  EvmTransactionData
};

export type AnyQuote =
  | BrlOnrampQuote
  | EurOnrampQuote
  | AlfredpayOnrampQuote
  | BrlOfframpQuote
  | EurOfframpQuote
  | AlfredpayOfframpQuote;

export type AlfredpayCurrency = FiatToken.USD | FiatToken.MXN | FiatToken.COP;

export type BrlOnrampQuote = QuoteResponse & {
  rampType: RampDirection.BUY;
  from: "pix";
};

export type EurOnrampQuote = QuoteResponse & {
  rampType: RampDirection.BUY;
  from: "sepa";
};

export type AlfredpayOnrampQuote = QuoteResponse & {
  rampType: RampDirection.BUY;
  inputCurrency: AlfredpayCurrency;
};

export type BrlOfframpQuote = QuoteResponse & {
  rampType: RampDirection.SELL;
  to: "pix";
};

export type EurOfframpQuote = QuoteResponse & {
  rampType: RampDirection.SELL;
  to: "sepa";
};

export type AlfredpayOfframpQuote = QuoteResponse & {
  rampType: RampDirection.SELL;
  outputCurrency: AlfredpayCurrency;
};

export type ExtendedQuoteResponse<T extends CreateQuoteRequest> = T extends { rampType: RampDirection.BUY; from: "pix" }
  ? BrlOnrampQuote
  : T extends { rampType: RampDirection.BUY; from: "sepa" }
    ? EurOnrampQuote
    : T extends { rampType: RampDirection.BUY; inputCurrency: AlfredpayCurrency }
      ? AlfredpayOnrampQuote
      : T extends { rampType: RampDirection.SELL; to: "pix" }
        ? BrlOfframpQuote
        : T extends { rampType: RampDirection.SELL; to: "sepa" }
          ? EurOfframpQuote
          : T extends { rampType: RampDirection.SELL; outputCurrency: AlfredpayCurrency }
            ? AlfredpayOfframpQuote
            : AnyQuote;

export type AnyAdditionalData =
  | BrlOfframpAdditionalData
  | EurOfframpAdditionalData
  | AlfredpayOfframpAdditionalData
  | BrlOnrampAdditionalData
  | EurOnrampAdditionalData
  | AlfredpayOnrampAdditionalData;

export type RegisterRampAdditionalData<Q extends QuoteResponse> = Q extends BrlOnrampQuote
  ? BrlOnrampAdditionalData
  : Q extends EurOnrampQuote
    ? EurOnrampAdditionalData
    : Q extends AlfredpayOnrampQuote
      ? AlfredpayOnrampAdditionalData
      : Q extends BrlOfframpQuote
        ? BrlOfframpAdditionalData
        : Q extends EurOfframpQuote
          ? EurOfframpAdditionalData
          : Q extends AlfredpayOfframpQuote
            ? AlfredpayOfframpAdditionalData
            : AnyAdditionalData;

export interface BrlOnrampAdditionalData {
  destinationAddress: string;
  taxId: string;
}

export interface EurOnrampAdditionalData {
  moneriumAuthToken: string;
}

export interface AlfredpayOnrampAdditionalData {
  destinationAddress: string;
  fiatAccountId: string;
  walletAddress?: string;
  sessionId?: string;
}

export interface BrlOfframpAdditionalData {
  pixDestination: string;
  receiverTaxId: string;
  taxId: string;
  walletAddress: string;
}

export interface EurOfframpAdditionalData {
  paymentData: PaymentData;
  walletAddress: string;
}

export interface AlfredpayOfframpAdditionalData {
  fiatAccountId: string;
  walletAddress: string;
  sessionId?: string;
}

export type AnyUpdateAdditionalData =
  | EurOnrampUpdateAdditionalData
  | BrlOfframpUpdateAdditionalData
  | EurOfframpUpdateAdditionalData
  | AlfredpayOfframpUpdateAdditionalData;

export type UpdateRampAdditionalData<Q extends QuoteResponse> = Q extends BrlOnrampQuote
  ? never // No additional data required from the user for this type of ramp.
  : Q extends EurOnrampQuote
    ? EurOnrampUpdateAdditionalData
    : Q extends AlfredpayOnrampQuote
      ? never // Alfredpay onramp settles fiat off-chain; no user transactions to update.
      : Q extends BrlOfframpQuote
        ? BrlOfframpUpdateAdditionalData
        : Q extends EurOfframpQuote
          ? EurOfframpUpdateAdditionalData
          : Q extends AlfredpayOfframpQuote
            ? AlfredpayOfframpUpdateAdditionalData
            : AnyUpdateAdditionalData;

export interface EurOnrampUpdateAdditionalData {
  squidRouterApproveHash: string;
  squidRouterSwapHash: string;
  moneriumOfframpSignature: string;
}

export interface BrlOfframpUpdateAdditionalData {
  squidRouterApproveHash?: string;
  squidRouterSwapHash?: string;
  assethubToPendulumHash?: string;
}
export interface EurOfframpUpdateAdditionalData {
  squidRouterApproveHash?: string;
  squidRouterSwapHash?: string;
  assethubToPendulumHash?: string;
}

export interface AlfredpayOfframpUpdateAdditionalData {
  squidRouterApproveHash?: string;
  squidRouterSwapHash?: string;
  assethubToPendulumHash?: string;
}

export interface BrlKycResponse {
  evmAddress: string;
  kycLevel: number;
}

export interface RampState {
  rampId: string;
  quoteId: string;
  ephemerals: {
    stellarEphemeral?: EphemeralAccount;
    substrateEphemeral?: EphemeralAccount;
    evmEphemeral?: EphemeralAccount;
  };
  currentPhase: RampPhase;
  unsignedTxs: UnsignedTx[];
}

export interface NetworkConfig {
  name: string;
  wsUrl: string;
}

export interface VortexSdkConfig {
  apiBaseUrl: string;
  /**
   * Public API key (pk_live_* or pk_test_*). Sent in request bodies for tracking
   * and partner-specific discounts. Optional during the grace period; some
   * endpoints will require it once enforcement begins.
   */
  publicKey?: string;
  /**
   * Secret API key (sk_live_* or sk_test_*). Sent as the `X-API-Key` header for
   * partner authentication. Optional during the grace period; endpoints that
   * accept a `partnerId` will require it once enforcement begins.
   */
  secretKey?: string;
  pendulumWsUrl?: string;
  moonbeamWsUrl?: string;
  hydrationWsUrl?: string;
  autoReconnect?: boolean;
  alchemyApiKey?: string;
  storeEphemeralKeys?: boolean;
}

// Handler interface for ramp-specific operations
// biome-ignore lint/complexity/noBannedTypes: TBD in the future
export type RampHandler = {};

// Context methods that handlers can use from VortexSdk
export interface VortexSdkContext {
  storeEphemerals: (ephemerals: { [key in EphemeralAccountType]?: EphemeralAccount }, rampId: string) => Promise<void>;
}
