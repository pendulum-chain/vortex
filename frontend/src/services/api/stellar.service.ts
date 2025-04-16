import { FiatToken, StellarEndpoints } from 'shared';
import { apiRequest } from './api-client';

/**
 * Service for interacting with Stellar API endpoints
 */
export class StellarService {
  private static readonly BASE_PATH = '/stellar';

  /**
   * Create a Stellar transaction
   * @param accountId The account ID
   * @param maxTime The maximum time
   * @param assetCode The asset code
   * @param baseFee The base fee
   * @returns The transaction signature, sequence, and public key
   */
  static async createTransaction(
    accountId: string,
    maxTime: number,
    assetCode: string,
    baseFee: string,
  ): Promise<StellarEndpoints.CreateStellarTransactionResponse> {
    const request: StellarEndpoints.CreateStellarTransactionRequest = {
      accountId,
      maxTime,
      assetCode,
      baseFee,
    };
    return apiRequest<StellarEndpoints.CreateStellarTransactionResponse>('post', `${this.BASE_PATH}/create`, request);
  }

  /**
   * Sign a SEP-10 challenge
   * @param challengeXDR The challenge XDR
   * @param outToken The output token
   * @param clientPublicKey The client public key
   * @param derivedMemo Optional derived memo
   * @returns The signed challenge
   */
  static async signSep10Challenge(
    challengeXDR: string,
    outToken: FiatToken,
    clientPublicKey: string,
    derivedMemo?: string,
  ): Promise<StellarEndpoints.SignSep10ChallengeResponse> {
    const request: StellarEndpoints.SignSep10ChallengeRequest = {
      challengeXDR,
      outToken,
      clientPublicKey,
      derivedMemo,
    };
    return apiRequest<StellarEndpoints.SignSep10ChallengeResponse>('post', `${this.BASE_PATH}/sep10`, request);
  }

  /**
   * Get the SEP-10 master public key
   * @returns The master public key
   */
  static async getSep10MasterPK(): Promise<StellarEndpoints.GetSep10MasterPKResponse> {
    return apiRequest<StellarEndpoints.GetSep10MasterPKResponse>('get', `${this.BASE_PATH}/sep10`);
  }
}
