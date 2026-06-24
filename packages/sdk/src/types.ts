// Types re-exported used to create quotes.

import type { CreateQuoteRequest, EvmTransactionData, PaymentMethod, QuoteResponse, SignedTypedData } from "@vortexfi/shared";
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

export type { CreateQuoteRequest, EvmTransactionData, PaymentMethod, QuoteResponse };
export { EPaymentMethod, EvmToken, FiatToken, Networks, RampDirection };

export type AnyQuote =
  | BrlOnrampQuote
  | EurOnrampQuote
  | AlfredpayOnrampQuote
  | BrlOfframpQuote
  | EurOfframpQuote
  | AlfredpayOfframpQuote;

export type AlfredpayCurrency = FiatToken.USD | FiatToken.MXN | FiatToken.COP | FiatToken.ARS;

export type BrlOnrampQuote = QuoteResponse & {
  rampType: RampDirection.BUY;
  from: EPaymentMethod.PIX;
};

export type EurOnrampQuote = QuoteResponse & {
  rampType: RampDirection.BUY;
  from: EPaymentMethod.SEPA;
};

export type AlfredpayOnrampQuote = QuoteResponse & {
  rampType: RampDirection.BUY;
  inputCurrency: AlfredpayCurrency;
};

export type BrlOfframpQuote = QuoteResponse & {
  rampType: RampDirection.SELL;
  to: EPaymentMethod.PIX;
};

export type EurOfframpQuote = QuoteResponse & {
  rampType: RampDirection.SELL;
  to: EPaymentMethod.SEPA;
};

export type AlfredpayOfframpQuote = QuoteResponse & {
  rampType: RampDirection.SELL;
  outputCurrency: AlfredpayCurrency;
};

// Alfredpay branches are checked before the pix/sepa branches to mirror the runtime routing in VortexSdk.registerRamp().
export type ExtendedQuoteResponse<T extends CreateQuoteRequest> = T extends {
  rampType: RampDirection.BUY;
  inputCurrency: AlfredpayCurrency;
}
  ? AlfredpayOnrampQuote
  : T extends { rampType: RampDirection.BUY; from: EPaymentMethod.PIX }
    ? BrlOnrampQuote
    : T extends { rampType: RampDirection.BUY; from: EPaymentMethod.SEPA }
      ? EurOnrampQuote
      : T extends { rampType: RampDirection.SELL; outputCurrency: AlfredpayCurrency }
        ? AlfredpayOfframpQuote
        : T extends { rampType: RampDirection.SELL; to: EPaymentMethod.PIX }
          ? BrlOfframpQuote
          : T extends { rampType: RampDirection.SELL; to: EPaymentMethod.SEPA }
            ? EurOfframpQuote
            : AnyQuote;

export type AnyAdditionalData =
  | BrlOfframpAdditionalData
  | EurOfframpAdditionalData
  | AlfredpayOfframpAdditionalData
  | BrlOnrampAdditionalData
  | EurOnrampAdditionalData
  | AlfredpayOnrampAdditionalData;

// Branch order mirrors ExtendedQuoteResponse (Alfredpay first per direction). Keys are mutually exclusive, so order is cosmetic here.
export type RegisterRampAdditionalData<Q extends QuoteResponse> = Q extends AlfredpayOnrampQuote
  ? AlfredpayOnrampAdditionalData
  : Q extends BrlOnrampQuote
    ? BrlOnrampAdditionalData
    : Q extends EurOnrampQuote
      ? EurOnrampAdditionalData
      : Q extends AlfredpayOfframpQuote
        ? AlfredpayOfframpAdditionalData
        : Q extends BrlOfframpQuote
          ? BrlOfframpAdditionalData
          : Q extends EurOfframpQuote
            ? EurOfframpAdditionalData
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
  fiatAccountId?: string;
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

export type UpdateRampAdditionalData<Q extends QuoteResponse> = Q extends AlfredpayOnrampQuote
  ? never // Alfredpay onramp settles fiat off-chain; no user transactions to update.
  : Q extends BrlOnrampQuote
    ? never // No additional data required from the user for this type of ramp.
    : Q extends EurOnrampQuote
      ? EurOnrampUpdateAdditionalData
      : Q extends AlfredpayOfframpQuote
        ? AlfredpayOfframpUpdateAdditionalData
        : Q extends BrlOfframpQuote
          ? BrlOfframpUpdateAdditionalData
          : Q extends EurOfframpQuote
            ? EurOfframpUpdateAdditionalData
            : AnyUpdateAdditionalData;

export interface EurOnrampUpdateAdditionalData {
  squidRouterApproveHash: string;
  squidRouterSwapHash: string;
  moneriumOfframpSignature: string;
}

export interface OfframpUpdateAdditionalData {
  squidRouterApproveHash?: string;
  squidRouterSwapHash?: string;
  assethubToPendulumHash?: string;
}

// BRL, EUR, and Alfredpay offramps all push back the same on-chain tx hashes.
export interface BrlOfframpUpdateAdditionalData extends OfframpUpdateAdditionalData {}
export interface EurOfframpUpdateAdditionalData extends OfframpUpdateAdditionalData {}
export interface AlfredpayOfframpUpdateAdditionalData extends OfframpUpdateAdditionalData {}

export interface BrlKycResponse {
  evmAddress: string;
  kycLevel: number;
}

export interface RampState {
  rampId: string;
  quoteId: string;
  ephemerals: {
    substrateEphemeral?: EphemeralAccount;
    evmEphemeral?: EphemeralAccount;
  };
  currentPhase: RampPhase;
  unsignedTxs: UnsignedTx[];
}

export interface UserTypedDataSigningContext {
  unsignedTransaction: UnsignedTx;
  payloadIndex: number;
  payloadCount: number;
}

export interface UserEvmTransactionContext {
  unsignedTransaction: UnsignedTx;
}

export interface SubmitUserTransactionsHandlers {
  includeDomainType?: boolean;
  signTypedData?: (payload: SignedTypedData, context: UserTypedDataSigningContext) => Promise<string>;
  sendTransaction?: (transaction: EvmTransactionData, context: UserEvmTransactionContext) => Promise<string>;
  handleUnsupported?: (tx: UnsignedTx) => Promise<void>;
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
