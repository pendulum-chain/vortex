import { DestinationType, FiatToken, Networks, OnChainToken } from '../index';

export namespace RampEndpoints {
  export interface PresignedTransaction {
    phase: string;
    tx_data: string;
    nonce?: number;
  }

  // POST /ramp/register
  export interface RegisterRampRequest {
    quoteId: string;
    signingAccounts: string[];
    additionalData?: {
      walletAddress?: string;
      pixDestination?: string;
      taxId?: string;
      brlaEvmAddress?: string;
      [key: string]: unknown;
    };
  }

  export interface RegisterRampResponse {
    id: string;
    type: string;
    currentPhase: string;
    from: DestinationType;
    to: DestinationType;
    state: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
    unsignedTxs: any[]; // Array of unsigned txs that need to be signed
  }

  // POST /ramp/start
  export interface StartRampRequest {
    rampId: string;
    presignedTxs: PresignedTransaction[];
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
    status: 'pending' | 'processing' | 'completed' | 'failed';
    currentPhase: string;
    progress: number;
    inputToken: OnChainToken;
    outputToken: OnChainToken | FiatToken;
    inputAmount: string;
    outputAmount: string;
    sourceNetwork: Networks;
    destinationNetwork?: Networks;
    createdAt: string;
    updatedAt: string;
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

  export interface RampErrorLog {
    timestamp: string;
    phase: string;
    message: string;
    details?: Record<string, unknown>;
  }

  export type GetRampErrorLogsResponse = RampErrorLog[];
}
