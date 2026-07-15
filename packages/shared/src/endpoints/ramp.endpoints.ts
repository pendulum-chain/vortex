import {
  AlfredpayFiatPaymentInstructions,
  DestinationType,
  EvmAddress,
  Networks,
  PaymentMethod,
  RampCurrency,
  RampDirection
} from "../index";
import { TransactionStatus } from "./webhook.endpoints";

export type Signature = { v: number; r: `0x${string}`; s: `0x${string}`; deadline: number };

export type RampPhase =
  | "initial"
  | "squidRouterPermitExecute"
  | "squidRouterNoPermitTransfer"
  | "squidRouterNoPermitApprove"
  | "squidRouterNoPermitSwap"
  | "squidRouterApprove"
  | "squidRouterSwap"
  | "squidRouterPay"
  | "fundEphemeral"
  | "destinationTransfer"
  | "nablaApprove"
  | "nablaSwap"
  | "hydrationSwap"
  | "hydrationToAssethubXcm"
  | "moonbeamToPendulum"
  | "moonbeamToPendulumXcm"
  | "pendulumToMoonbeamXcm"
  | "pendulumToHydrationXcm"
  | "assethubToPendulum"
  | "pendulumToAssethubXcm"
  | "subsidizePreSwap"
  | "subsidizePostSwap"
  | "distributeFees"
  | "alfredpayOnrampMint"
  | "alfredOnrampMintFallback"
  | "alfredpayOfframpTransfer"
  | "alfredpayOfframpTransferFallback"
  | "brlaOnrampMint"
  | "onHoldForComplianceCheck"
  | "brlaPayoutOnBase"
  | "mykoboOnrampDeposit"
  | "mykoboPayoutOnBase"
  | "baseTransfer"
  | "failed"
  | "timedOut"
  | "finalSettlementSubsidy"
  | "destinationTransfer"
  | "backupSquidRouterApprove"
  | "backupSquidRouterSwap"
  | "backupApprove"
  | "complete";

export type CleanupPhase =
  | "moonbeamCleanup"
  | "pendulumCleanup"
  | "polygonCleanup"
  | "polygonCleanupAxlUsdc"
  | "hydrationCleanup"
  | "assetHubCleanup"
  | "baseCleanupUsdc"
  | "baseCleanupBrla"
  | "baseCleanupEurc"
  | "baseCleanupAxlUsdc";

export enum EphemeralAccountType {
  Substrate = "Substrate",
  EVM = "EVM"
}

export interface AccountMeta {
  address: string;
  type: EphemeralAccountType;
}

export interface EvmTransactionData {
  to: EvmAddress;
  data: EvmAddress;
  value: string;
  gas: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  nonce?: number;
}

export interface TypedDataDomain {
  name: string;
  version: string;
  salt?: `0x${string}`;
  chainId?: number;
  verifyingContract: EvmAddress;
}

export interface TypedDataField {
  name: string;
  type: string;
}

export interface SignedTypedData {
  domain: TypedDataDomain;
  types: Record<string, TypedDataField[]>;
  primaryType: string;
  message: Record<string, unknown>;
  signature?: Signature | Signature[];
}

export function isEvmTransactionData(
  data: string | EvmTransactionData | SignedTypedData | SignedTypedData[]
): data is EvmTransactionData {
  return typeof data === "object" && data !== null && !Array.isArray(data) && "to" in data && "data" in data;
}

export function isSignedTypedData(
  data: string | EvmTransactionData | SignedTypedData | SignedTypedData[]
): data is SignedTypedData {
  return (
    typeof data === "object" &&
    data !== null &&
    !Array.isArray(data) &&
    "domain" in data &&
    "types" in data &&
    "primaryType" in data &&
    "message" in data
  );
}

export function isSignedTypedDataArray(
  data: string | EvmTransactionData | SignedTypedData | SignedTypedData[]
): data is SignedTypedData[] {
  return Array.isArray(data) && data.length > 0 && data.every(item => isSignedTypedData(item as unknown as SignedTypedData));
}

export interface UnsignedTx {
  txData: string | EvmTransactionData | SignedTypedData | SignedTypedData[];
  phase: RampPhase | CleanupPhase;
  network: Networks;
  nonce: number;
  signer: string;
  meta: {
    expectedSequenceNumber?: string;
    additionalTxs?: Record<string, PresignedTx>;
  };
}

export type PresignedTx = UnsignedTx;

export interface RampErrorLog {
  timestamp: string;
  phase: RampPhase;
  error: string;
  details?: string;
  recoverable?: boolean;
}

export interface PaymentData {
  amount: string;
  memo: string;
  memoType: "text" | "hash" | "id";
}

export interface IbanPaymentData {
  receiverName: string;
  iban: string;
  bic: string;
  /** Optional payment reference (e.g. Mykobo deposit SCOR). Caller should include it in the SEPA transfer. */
  reference?: string;
}

export interface RegisterRampRequest {
  quoteId: string;
  signingAccounts: AccountMeta[];
  userId?: string;
  additionalData?: {
    fiatAccountId?: string; // For determine the correct payment method for AlfredPay flows
    walletAddress?: string;
    destinationAddress?: string;
    paymentData?: PaymentData;
    pixDestination?: string;
    receiverTaxId?: string;
    /**
     * @deprecated Derived server-side from `api_keys.user_id -> tax_ids.user_id`
     * for linked secret-key callers and Supabase-authenticated callers. The
     * server accepts a value for one release of backward compatibility, but
     * mismatches against the derived taxId are rejected.
     */
    taxId?: string;
    sessionId?: string;
    email?: string; // Required for Mykobo EUR ramps (binds ramp to anchor profile)
    ipAddress?: string; // Required for Mykobo EUR ramps (user IP for fraud checks; auto-filled from req.ip if omitted)
    [key: string]: unknown;
  };
}

export type UpdateRampResponse = RampProcess;

// POST /ramp/start
export interface StartRampRequest {
  rampId: string;
}

export type RegisterRampResponse = RampProcess;

export interface UpdateRampRequest {
  rampId: string;
  presignedTxs: PresignedTx[];
  additionalData?: {
    squidRouterApproveHash?: string;
    squidRouterSwapHash?: string;
    squidRouterNoPermitTransferHash?: string;
    squidRouterNoPermitApproveHash?: string;
    squidRouterNoPermitSwapHash?: string;
    assethubToPendulumHash?: string;
    [key: string]: unknown;
  };
}

export type StartRampResponse = RampProcess;

export interface RampProcess {
  countryCode?: string;
  createdAt: string;
  currentPhase: RampPhase;
  depositQrCode?: string;
  expiresAt?: string;
  from: DestinationType;
  ibanPaymentData?: IbanPaymentData;
  achPaymentData?: AlfredpayFiatPaymentInstructions;
  id: string;
  inputAmount: string;
  inputCurrency: string;
  network?: Networks;
  outputAmount: string;
  outputCurrency: string;
  paymentMethod: PaymentMethod;
  quoteId: string;
  sessionId?: string;
  status?: TransactionStatus;
  to: DestinationType;
  transactionExplorerLink?: string;
  transactionHash?: string;
  type: RampDirection;
  unsignedTxs?: UnsignedTx[];
  updatedAt: string;
  walletAddress?: string;
}

export interface GetRampStatusRequest {
  id: string;
}

export interface GetRampStatusResponse extends RampProcess {
  // Fee fields in fiat currency
  anchorFeeFiat: string;
  networkFeeFiat: string;
  partnerFeeFiat: string;
  vortexFeeFiat: string;
  totalFeeFiat: string;
  processingFeeFiat: string;
  feeCurrency: string;
  // Fee fields in USD
  anchorFeeUsd: string;
  networkFeeUsd: string;
  partnerFeeUsd: string;
  vortexFeeUsd: string;
  totalFeeUsd: string;
  processingFeeUsd: string;
  // User benefit from quote-time discount, displayed in feeCurrency when present
  discountFiat?: string;
  discountUsd?: string;
  discountCurrency?: RampCurrency;
}

export interface GetRampErrorLogsRequest {
  id: string;
}

export type GetRampErrorLogsResponse = RampErrorLog[];

export interface GetRampHistoryRequest {
  walletAddress: string;
}

export interface GetRampHistoryTransaction {
  id: string;
  type: RampDirection;
  from: Networks | PaymentMethod;
  to: Networks | PaymentMethod;
  fromAmount: string;
  toAmount: string;
  fromCurrency: RampCurrency;
  toCurrency: RampCurrency;
  status: TransactionStatus;
  currentPhase: RampPhase;
  date: string;
  externalTxHash?: string;
  externalTxExplorerLink?: string;
}

export type GetRampHistoryResponse = {
  transactions: GetRampHistoryTransaction[];
  totalCount: number;
};
