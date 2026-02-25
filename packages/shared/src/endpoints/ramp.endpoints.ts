import {
  AlfredpayFiatPaymentInstructions,
  DestinationType,
  EvmAddress,
  Networks,
  PaymentMethod,
  PermitSignature,
  RampCurrency,
  RampDirection,
  Signature
} from "../index";
import { TransactionStatus } from "./webhook.endpoints";

export type RampPhase =
  | "initial"
  | "moneriumOnrampSelfTransfer"
  | "moneriumOnrampMint"
  | "squidrouterPermitExecute"
  | "stellarCreateAccount"
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
  | "spacewalkRedeem"
  | "stellarPayment"
  | "subsidizePreSwap"
  | "subsidizePostSwap"
  | "distributeFees"
  | "alfredpayOnrampMint"
  | "alfredpayOfframpTransfer"
  | "brlaOnrampMint"
  | "brlaPayoutOnMoonbeam"
  | "failed"
  | "timedOut"
  | "finalSettlementSubsidy"
  | "destinationTransfer"
  | "backupSquidRouterApprove"
  | "backupSquidRouterSwap"
  | "backupApprove"
  | "complete";

export type CleanupPhase = "moonbeamCleanup" | "pendulumCleanup" | "stellarCleanup";

export enum EphemeralAccountType {
  Stellar = "Stellar",
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
  chainId: number;
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
  return Array.isArray(data) && data.length > 0 && data.every(item => isSignedTypedData(item as any));
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
  anchorTargetAccount: string; // The account of the Stellar anchor where the payment is sent
}

export interface IbanPaymentData {
  receiverName: string;
  iban: string;
  bic: string;
}

export interface RegisterRampRequest {
  quoteId: string;
  signingAccounts: AccountMeta[];
  userId?: string;
  additionalData?: {
    walletAddress?: string;
    destinationAddress?: string;
    moneriumWalletAddress?: string;
    paymentData?: PaymentData;
    pixDestination?: string;
    receiverTaxId?: string;
    taxId?: string;
    moneriumAuthToken?: string | null; // Monerium authentication code for Monerium offramps.
    sessionId?: string;
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
    assethubToPendulumHash?: string;
    moneriumOfframpSignature?: string; // Required to trigger Monerium offramp
    moneriumOnrampPermit?: PermitSignature;
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
  date: string;
  externalTxHash?: string;
  externalTxExplorerLink?: string;
}

export type GetRampHistoryResponse = {
  transactions: GetRampHistoryTransaction[];
  totalCount: number;
};
