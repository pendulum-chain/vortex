// Types re-exported used to create quotes.

import type {
  CreateQuoteRequest,
  DomesticFiatAccount,
  EvmTransactionData,
  PaymentMethod,
  QuoteResponse,
  SignedTypedData
} from "@vortexfi/shared";
import {
  DomesticCountry,
  DomesticFiatAccountType,
  EPaymentMethod,
  EphemeralAccount,
  EphemeralAccountType,
  EvmToken,
  FiatToken,
  Networks,
  RampDirection,
  RampPhase,
  UnsignedTx
} from "@vortexfi/shared";

export type { DomesticFiatAccount, CreateQuoteRequest, EvmTransactionData, PaymentMethod, QuoteResponse };
export { DomesticCountry, DomesticFiatAccountType, EPaymentMethod, EvmToken, FiatToken, Networks, RampDirection };

/*
 * Deprecated provider-named aliases.
 *
 * The public surface is named after the corridor family it serves (`Brl`, `Domestic`)
 * so it stays stable if the underlying payment partner changes. These aliases keep the
 * previous provider-named exports compiling and are removed in the next major release.
 */

/** @deprecated Renamed to {@link DomesticCountry}. */
export const AlfredPayCountry = DomesticCountry;
/** @deprecated Renamed to {@link DomesticCountry}. */
export type AlfredPayCountry = DomesticCountry;
/** @deprecated Renamed to {@link DomesticFiatAccountType}. */
export const AlfredpayFiatAccountType = DomesticFiatAccountType;
/** @deprecated Renamed to {@link DomesticFiatAccountType}. */
export type AlfredpayFiatAccountType = DomesticFiatAccountType;
/** @deprecated Renamed to {@link DomesticFiatAccount}. */
export type AlfredpayFiatAccount = DomesticFiatAccount;
/** @deprecated Renamed to {@link DomesticCurrency}. */
export type AlfredpayCurrency = DomesticCurrency;
/** @deprecated Renamed to {@link DomesticOnrampQuote}. */
export type AlfredpayOnrampQuote = DomesticOnrampQuote;
/** @deprecated Renamed to {@link DomesticOfframpQuote}. */
export type AlfredpayOfframpQuote = DomesticOfframpQuote;
/** @deprecated Renamed to {@link DomesticOnrampAdditionalData}. */
export type AlfredpayOnrampAdditionalData = DomesticOnrampAdditionalData;
/** @deprecated Renamed to {@link DomesticOfframpAdditionalData}. */
export type AlfredpayOfframpAdditionalData = DomesticOfframpAdditionalData;
/** @deprecated Renamed to {@link DomesticOfframpUpdateAdditionalData}. */
export type AlfredpayOfframpUpdateAdditionalData = DomesticOfframpUpdateAdditionalData;

export type AnyQuote =
  | BrlOnrampQuote
  | EurOnrampQuote
  | DomesticOnrampQuote
  | BrlOfframpQuote
  | EurOfframpQuote
  | DomesticOfframpQuote;

export type DomesticCurrency = FiatToken.USD | FiatToken.MXN | FiatToken.COP | FiatToken.ARS;

export type BrlOnrampQuote = QuoteResponse & {
  rampType: RampDirection.BUY;
  from: EPaymentMethod.PIX;
};

export type EurOnrampQuote = QuoteResponse & {
  rampType: RampDirection.BUY;
  from: EPaymentMethod.SEPA;
};

export type DomesticOnrampQuote = QuoteResponse & {
  rampType: RampDirection.BUY;
  inputCurrency: DomesticCurrency;
};

export type BrlOfframpQuote = QuoteResponse & {
  rampType: RampDirection.SELL;
  to: EPaymentMethod.PIX;
};

export type EurOfframpQuote = QuoteResponse & {
  rampType: RampDirection.SELL;
  to: EPaymentMethod.SEPA;
};

export type DomesticOfframpQuote = QuoteResponse & {
  rampType: RampDirection.SELL;
  outputCurrency: DomesticCurrency;
};

// Domestic-corridor branches are checked before the pix/sepa branches to mirror the runtime routing in VortexSdk.registerRamp().
export type ExtendedQuoteResponse<T extends CreateQuoteRequest> = T extends {
  rampType: RampDirection.BUY;
  inputCurrency: DomesticCurrency;
}
  ? DomesticOnrampQuote
  : T extends { rampType: RampDirection.BUY; from: EPaymentMethod.PIX }
    ? BrlOnrampQuote
    : T extends { rampType: RampDirection.BUY; from: EPaymentMethod.SEPA }
      ? EurOnrampQuote
      : T extends { rampType: RampDirection.SELL; outputCurrency: DomesticCurrency }
        ? DomesticOfframpQuote
        : T extends { rampType: RampDirection.SELL; to: EPaymentMethod.PIX }
          ? BrlOfframpQuote
          : T extends { rampType: RampDirection.SELL; to: EPaymentMethod.SEPA }
            ? EurOfframpQuote
            : AnyQuote;

export type AnyAdditionalData =
  | BrlOfframpAdditionalData
  | EurOfframpAdditionalData
  | DomesticOfframpAdditionalData
  | BrlOnrampAdditionalData
  | EurOnrampAdditionalData
  | DomesticOnrampAdditionalData;

// Branch order mirrors ExtendedQuoteResponse (domestic-corridor first per direction). Keys are mutually exclusive, so order is cosmetic here.
export type RegisterRampAdditionalData<Q extends QuoteResponse> = Q extends DomesticOnrampQuote
  ? DomesticOnrampAdditionalData
  : Q extends BrlOnrampQuote
    ? BrlOnrampAdditionalData
    : Q extends EurOnrampQuote
      ? EurOnrampAdditionalData
      : Q extends DomesticOfframpQuote
        ? DomesticOfframpAdditionalData
        : Q extends BrlOfframpQuote
          ? BrlOfframpAdditionalData
          : Q extends EurOfframpQuote
            ? EurOfframpAdditionalData
            : AnyAdditionalData;

export interface BrlOnrampAdditionalData {
  destinationAddress: string;
  /**
   * @deprecated The BRL account is now derived server-side from the authenticated
   * profile's canonical customer entity and provider customer. The SDK still
   * accepts the field for one release of backward compatibility, but the server
   * rejects mismatches.
   */
  taxId?: string;
}

export interface EurOnrampAdditionalData {
  destinationAddress: string;
  email: string;
  ipAddress: string;
}

export interface DomesticOnrampAdditionalData {
  destinationAddress: string;
  fiatAccountId?: string;
  walletAddress?: string;
  sessionId?: string;
}

export interface BrlOfframpAdditionalData {
  pixDestination: string;
  walletAddress: string;
  receiverTaxId?: string;
  /**
   * @deprecated The BRL account is now derived server-side from the authenticated
   * profile's canonical customer entity and provider customer. The SDK still
   * accepts the field for one release of backward compatibility, but the server
   * rejects mismatches.
   */
  taxId?: string;
}

export interface EurOfframpAdditionalData {
  destinationAddress: string;
  email: string;
  ipAddress: string;
  walletAddress: string;
}

export interface DomesticOfframpAdditionalData {
  fiatAccountId: string;
  walletAddress: string;
  sessionId?: string;
}

export type AnyUpdateAdditionalData =
  | BrlOfframpUpdateAdditionalData
  | EurOfframpUpdateAdditionalData
  | DomesticOfframpUpdateAdditionalData;

export type UpdateRampAdditionalData<Q extends QuoteResponse> = Q extends DomesticOnrampQuote
  ? never // Domestic-corridor onramp settles fiat off-chain; no user transactions to update.
  : Q extends BrlOnrampQuote
    ? never // No additional data required from the user for this type of ramp.
    : Q extends EurOnrampQuote
      ? never // No additional data required from the user for EUR onramp.
      : Q extends DomesticOfframpQuote
        ? DomesticOfframpUpdateAdditionalData
        : Q extends BrlOfframpQuote
          ? BrlOfframpUpdateAdditionalData
          : Q extends EurOfframpQuote
            ? EurOfframpUpdateAdditionalData
            : AnyUpdateAdditionalData;

export interface OfframpUpdateAdditionalData {
  squidRouterApproveHash?: string;
  squidRouterSwapHash?: string;
  assethubToPendulumHash?: string;
}

// BRL, EUR, and domestic-corridor offramps all push back the same on-chain tx hashes.
export interface BrlOfframpUpdateAdditionalData extends OfframpUpdateAdditionalData {}
export interface EurOfframpUpdateAdditionalData extends OfframpUpdateAdditionalData {}
export interface DomesticOfframpUpdateAdditionalData extends OfframpUpdateAdditionalData {}

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

export type OfframpFundingMode = "prefunded" | "deferred";

export interface VortexSdkConfig {
  apiBaseUrl: string;
  /**
   * Public API key (pk_live_* or pk_test_*). Sent as `X-Public-Key` and retained
   * in quote request bodies for compatibility.
   */
  publicKey?: string;
  /**
   * Secret API key (sk_live_* or sk_test_*). Sent as the `X-API-Key` header.
   */
  secretKey?: string;
  pendulumWsUrl?: string;
  moonbeamWsUrl?: string;
  hydrationWsUrl?: string;
  /**
   * Maximum time to wait when a signing operation first needs a Substrate
   * WebSocket API. Chain APIs are initialized lazily and independently.
   * @default 15000
   */
  networkInitializationTimeoutMs?: number;
  autoReconnect?: boolean;
  alchemyApiKey?: string;
  storeEphemeralKeys?: boolean;
  /**
   * Controls whether `registerRamp` checks that the source wallet holds the
   * quoted offramp amount. Deferred integrations must fund the wallet before
   * submitting user transactions and starting the ramp.
   * @default "prefunded"
   */
  offrampFundingMode?: OfframpFundingMode;
}

// Handler interface for ramp-specific operations
// biome-ignore lint/complexity/noBannedTypes: TBD in the future
export type RampHandler = {};

// Context methods that handlers can use from VortexSdk
export interface VortexSdkContext {
  storeEphemerals: (ephemerals: { [key in EphemeralAccountType]?: EphemeralAccount }, rampId: string) => Promise<void>;
}
