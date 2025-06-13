import { FiatToken } from '../index';

export namespace StellarEndpoints {
  // POST /stellar/create
  export interface CreateStellarTransactionRequest {
    accountId: string;
    maxTime: number;
    assetCode: string;
    baseFee: string;
  }

  export interface CreateStellarTransactionResponse {
    signature: string;
    sequence: string;
    public: string;
  }

  // POST /stellar/sep10
  export interface SignSep10ChallengeRequest {
    challengeXDR: string;
    outToken: FiatToken;
    clientPublicKey: string;
    derivedMemo?: string;
  }

  export interface SignSep10ChallengeResponse {
    masterClientSignature: string;
    masterClientPublic: string;
    clientSignature: string;
    clientPublic: string;
  }

  // GET /stellar/sep10
  export interface GetSep10MasterPKResponse {
    masterSep10Public: string;
  }

  export interface StellarErrorResponse {
    error: string;
    details?: string;
  }
}
