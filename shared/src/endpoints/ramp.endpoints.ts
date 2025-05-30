import { DestinationType, Networks } from '../index';

export type RampPhase =
  | 'initial'
  | 'timedOut'
  | 'stellarCreateAccount'
  | 'squidrouterApprove'
  | 'squidrouterSwap'
  | 'fundEphemeral'
  | 'nablaApprove'
  | 'nablaSwap'
  | 'moonbeamToPendulum'
  | 'moonbeamToPendulumXcm'
  | 'pendulumToMoonbeam'
  | 'assethubToPendulum'
  | 'pendulumToAssethub'
  | 'spacewalkRedeem'
  | 'stellarPayment'
  | 'subsidizePreSwap'
  | 'subsidizePostSwap'
  | 'distributeFees'
  | 'brlaTeleport'
  | 'brlaPayoutOnMoonbeam'
  | 'failed'
  | 'timedOut'
  | 'complete';

export type CleanupPhase = 'moonbeamCleanup' | 'pendulumCleanup' | 'stellarCleanup';

export interface AccountMeta {
  address: string;
  network: Networks;
}

export interface EvmTransactionData {
  to: `0x${string}`;
  data: `0x${string}`;
  value: string;
  gas: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
}

export function isEvmTransactionData(data: string | EvmTransactionData): data is EvmTransactionData {
  return typeof data === 'object' && data !== null && 'to' in data && 'data' in data;
}

export interface UnsignedTx {
  txData: string | EvmTransactionData;
  phase: RampPhase | CleanupPhase;
  network: Networks;
  nonce: number;
  signer: string;
  meta?: any;
}

export type PresignedTx = UnsignedTx & {};

export interface RampErrorLog {
  timestamp: string;
  phase: RampPhase;
  error: string;
  details?: Record<string, unknown>;
  recoverable?: boolean
}

export interface PaymentData {
  amount: string;
  memo: string;
  memoType: 'text' | 'hash';
  anchorTargetAccount: string; // The account of the Stellar anchor where the payment is sent
}

export namespace RampEndpoints {
  // POST /ramp/register
  export interface RegisterRampRequest {
    quoteId: string;
    signingAccounts: AccountMeta[];
    additionalData?: {
      walletAddress?: string; // Wallet address initiating the offramp.
      destinationAddress?: string; // Destination address, used for onramp.
      paymentData?: PaymentData;
      pixDestination?: string;
      receiverTaxId?: string;
      taxId?: string;
      [key: string]: unknown;
    };
  }

  export type RegisterRampResponse = RampProcess;

  // POST /ramp/start
  export interface StartRampRequest {
    rampId: string;
    presignedTxs: PresignedTx[];
    additionalData?: {
      squidRouterApproveHash: string | undefined;
      squidRouterSwapHash: string | undefined;
      assetHubToPendulumHash: string | undefined;
      [key: string]: unknown;
    };
  }

  // The response is the same as RampProcess
  export type StartRampResponse = RampProcess;

  export interface RampProcess {
    id: string;
    quoteId: string;
    type: 'on' | 'off';
    currentPhase: RampPhase;
    from: DestinationType;
    to: DestinationType;
    createdAt: string;
    updatedAt: string;
    unsignedTxs: UnsignedTx[]; // Array of unsigned txs that need to be signed
    brCode?: string;
  }

  // GET /ramp/:id
  export interface GetRampStatusRequest {
    id: string;
  }

  // The response is the same as RampProcess
  export type GetRampStatusResponse = RampProcess;

  // GET /ramp/:id/errors
  export interface GetRampErrorLogsRequest {
    id: string;
  }

  export type GetRampErrorLogsResponse = RampErrorLog[];

  // GET /ramp/history/:walletAddress
  export interface GetRampHistoryRequest {
    walletAddress: string;
  }

  export type GetRampHistoryResponse = {
    transactions: {
      id: string;
      type: 'on' | 'off';
      fromNetwork: string;
      toNetwork: string;
      fromAmount: string;
      toAmount: string;
      fromCurrency: string;
      toCurrency: string;
      status: string;
      date: string;
    }[];
  };
}
