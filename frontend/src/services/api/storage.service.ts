import { StorageEndpoints } from 'shared';
import { apiRequest } from './api-client';

/**
 * Service for interacting with Storage API endpoints
 */
export class StorageService {
  private static readonly BASE_PATH = '/storage';

  /**
   * Store data for a specific flow type
   * @param request The storage request data
   * @returns Success message
   */
  static async storeData(request: StorageEndpoints.StoreDataRequest): Promise<StorageEndpoints.StoreDataResponse> {
    return apiRequest<StorageEndpoints.StoreDataResponse>('post', `${this.BASE_PATH}/create`, request);
  }

  /**
   * Store data for EVM to Stellar flow
   * @param data The EVM to Stellar flow data
   * @returns Success message
   */
  static async storeEvmToStellarData(
    data: Omit<StorageEndpoints.EvmToStellarStorageRequest, 'flowType' | 'timestamp'>,
  ): Promise<StorageEndpoints.StoreDataResponse> {
    const request: StorageEndpoints.EvmToStellarStorageRequest = {
      ...data,
      flowType: StorageEndpoints.OfframpHandlerType.EVM_TO_STELLAR,
      timestamp: new Date().toISOString(),
    };
    return this.storeData(request);
  }

  /**
   * Store data for Assethub to Stellar flow
   * @param data The Assethub to Stellar flow data
   * @returns Success message
   */
  static async storeAssethubToStellarData(
    data: Omit<StorageEndpoints.AssethubToStellarStorageRequest, 'flowType' | 'timestamp'>,
  ): Promise<StorageEndpoints.StoreDataResponse> {
    const request: StorageEndpoints.AssethubToStellarStorageRequest = {
      ...data,
      flowType: StorageEndpoints.OfframpHandlerType.ASSETHUB_TO_STELLAR,
      timestamp: new Date().toISOString(),
    };
    return this.storeData(request);
  }

  /**
   * Store data for EVM to BRLA flow
   * @param data The EVM to BRLA flow data
   * @returns Success message
   */
  static async storeEvmToBrlaData(
    data: Omit<StorageEndpoints.EvmToBrlaStorageRequest, 'flowType' | 'timestamp'>,
  ): Promise<StorageEndpoints.StoreDataResponse> {
    const request: StorageEndpoints.EvmToBrlaStorageRequest = {
      ...data,
      flowType: StorageEndpoints.OfframpHandlerType.EVM_TO_BRLA,
      timestamp: new Date().toISOString(),
    };
    return this.storeData(request);
  }

  /**
   * Store data for Assethub to BRLA flow
   * @param data The Assethub to BRLA flow data
   * @returns Success message
   */
  static async storeAssethubToBrlaData(
    data: Omit<StorageEndpoints.AssethubToBrlaStorageRequest, 'flowType' | 'timestamp'>,
  ): Promise<StorageEndpoints.StoreDataResponse> {
    const request: StorageEndpoints.AssethubToBrlaStorageRequest = {
      ...data,
      flowType: StorageEndpoints.OfframpHandlerType.ASSETHUB_TO_BRLA,
      timestamp: new Date().toISOString(),
    };
    return this.storeData(request);
  }

  /**
   * Store data for BRLA to EVM flow
   * @param data The BRLA to EVM flow data
   * @returns Success message
   */
  static async storeBrlaToEvmData(
    data: Omit<StorageEndpoints.BrlaToEvmStorageRequest, 'flowType' | 'timestamp'>,
  ): Promise<StorageEndpoints.StoreDataResponse> {
    const request: StorageEndpoints.BrlaToEvmStorageRequest = {
      ...data,
      flowType: StorageEndpoints.OnrampHandlerType.BRLA_TO_EVM,
      timestamp: new Date().toISOString(),
    };
    return this.storeData(request);
  }

  /**
   * Store data for BRLA to Assethub flow
   * @param data The BRLA to Assethub flow data
   * @returns Success message
   */
  static async storeBrlaToAssethubData(
    data: Omit<StorageEndpoints.BrlaToAssethubStorageRequest, 'flowType' | 'timestamp'>,
  ): Promise<StorageEndpoints.StoreDataResponse> {
    const request: StorageEndpoints.BrlaToAssethubStorageRequest = {
      ...data,
      flowType: StorageEndpoints.OnrampHandlerType.BRLA_TO_ASSETHUB,
      timestamp: new Date().toISOString(),
    };
    return this.storeData(request);
  }
}
