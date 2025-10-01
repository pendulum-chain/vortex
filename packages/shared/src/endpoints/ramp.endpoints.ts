import { DestinationType, EvmAddress, Networks, RampDirection } from "../index";

export type RampPhase =
  | "initial"
  | "brlaTransfer"
  | "moneriumOnrampSelfTransfer"
  | "moneriumOnrampMint"
  | "stellarCreateAccount"
  | "squidRouterApprove"
  | "squidRouterSwap"
  | "squidRouterPay"
  | "fundEphemeral"
  | "nablaApprove"
  | "nablaSwap"
  | "moonbeamToPendulum"
  | "moonbeamToPendulumXcm"
  | "pendulumToMoonbeam"
  | "pendulumToHydrationXcm"
  | "assethubToPendulum"
  | "pendulumToAssethubXcm"
  | "moonbeamXcmToAssethub"
  | "spacewalkRedeem"
  | "stellarPayment"
  | "subsidizePreSwap"
  | "subsidizePostSwap"
  | "distributeFees"
  | "brlaOnrampMint"
  | "brlaPayoutOnMoonbeam"
  | "failed"
  | "timedOut"
  | "complete";

export type CleanupPhase = "moonbeamCleanup" | "pendulumCleanup" | "stellarCleanup";

export interface AccountMeta {
  address: string;
  network: Networks;
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

export function isEvmTransactionData(data: string | EvmTransactionData): data is EvmTransactionData {
  return typeof data === "object" && data !== null && "to" in data && "data" in data;
}

export interface UnsignedTx {
  txData: string | EvmTransactionData;
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
  memoType: "text" | "hash";
  anchorTargetAccount: string; // The account of the Stellar anchor where the payment is sent
}

export interface IbanPaymentData {
  iban: string;
  bic: string;
}

export interface RegisterRampRequest {
  quoteId: string;
  signingAccounts: AccountMeta[];
  additionalData?: {
    walletAddress?: string;
    destinationAddress?: string;
    paymentData?: PaymentData;
    pixDestination?: string;
    receiverTaxId?: string;
    taxId?: string;
    moneriumAuthToken?: string | null; // Monerium authentication code for Monerium offramps.
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
    assetHubToPendulumHash?: string;
    moneriumOfframpSignature?: string; // Required to trigger Monerium offramp
    [key: string]: unknown;
  };
}

export type StartRampResponse = RampProcess;

export interface RampProcess {
  id: string;
  quoteId: string;
  type: RampDirection;
  currentPhase: RampPhase;
  from: DestinationType;
  to: DestinationType;
  createdAt: string;
  updatedAt: string;
  unsignedTxs: UnsignedTx[];
  depositQrCode?: string;
  ibanPaymentData?: IbanPaymentData;
}

export interface GetRampStatusRequest {
  id: string;
}

export type GetRampStatusResponse = RampProcess;

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
  fromNetwork: string;
  toNetwork: string;
  fromAmount: string;
  toAmount: string;
  fromCurrency: string;
  toCurrency: string;
  status: string;
  date: string;
}

export type GetRampHistoryResponse = {
  transactions: GetRampHistoryTransaction[];
};
