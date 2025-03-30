import {DestinationType, Networks} from '../index';

export type RampPhase =
  | 'initial'
  | 'squidrouterApprove'
  | 'squidrouterSwap'
  | 'fundEphemeral'
  | 'nablaApprove'
  | 'nablaSwap'
  | 'moonbeamToPendulum'
  | 'pendulumToMoonbeam'
  | 'assethubToPendulum'
  | 'pendulumToAssethub'
  | 'spacewalkRedeem'
  | 'stellarPayment'
  | 'stellarCleanup'
  | 'pendulumCleanup'
  | 'subsidizePreSwap'
  | 'subsidizePostSwap'
  | 'createPayInRequest'
  | 'brlaPayoutOnMoonbeam'
  | 'failed'
  | 'complete';

export interface AccountMeta {
  address: string;
  network: Networks;
}

export interface UnsignedTx {
  tx_data: string;
  phase: RampPhase;
  network: Networks;
  nonce: number;
  signer: string;
}

export type PresignedTx = UnsignedTx & {
  signature: string;
};

export interface RampErrorLog {
  timestamp: string;
  phase: RampPhase;
  error: string;
  details?: Record<string, unknown>;
}

export namespace RampEndpoints {
  // POST /ramp/register
  export interface RegisterRampRequest {
    quoteId: string;
    signingAccounts: AccountMeta[];
    additionalData?: {
      walletAddress?: string;
      pixDestination?: string;
      taxId?: string;
      brlaEvmAddress?: string;
      [key: string]: unknown;
    };
  }

  export type RegisterRampResponse = RampProcess;

  // POST /ramp/start
  export interface StartRampRequest {
    rampId: string;
    presignedTxs: PresignedTx[];
    additionalData?: {
      walletAddress?: string;
      pixDestination?: string;
      taxId?: string;
      brlaEvmAddress?: string;
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
}
