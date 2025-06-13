import { MoonbeamExecuteXcmRequest, MoonbeamExecuteXcmResponse } from '@packages/shared';
import { apiRequest } from './api-client';

/**
 * Service for interacting with Moonbeam API endpoints
 */
export class MoonbeamService {
  private static readonly BASE_PATH = '/moonbeam';

  /**
   * Execute an XCM operation
   * @param id The operation ID
   * @param payload The XCM payload
   * @returns The transaction hash
   */
  static async executeXcm(id: string, payload: string): Promise<MoonbeamExecuteXcmResponse> {
    const request: MoonbeamExecuteXcmRequest = { id, payload };
    return apiRequest<MoonbeamExecuteXcmResponse>('post', `${this.BASE_PATH}/execute-xcm`, request);
  }
}
