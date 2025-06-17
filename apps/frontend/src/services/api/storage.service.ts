import {
  AssethubToBrlaStorageRequest,
  AssethubToStellarStorageRequest,
  BrlaToAssethubStorageRequest,
  BrlaToEvmStorageRequest,
  EvmToBrlaStorageRequest,
  EvmToStellarStorageRequest,
  OfframpHandlerType,
  OnrampHandlerType,
  StoreDataRequest,
  StoreDataResponse
} from "@packages/shared";
import { apiRequest } from "./api-client";

/**
 * Service for interacting with Storage API endpoints
 */
export class StorageService {
  private static readonly BASE_PATH = "/storage";

  /**
   * Store data for a specific flow type
   * @param request The storage request data
   * @returns Success message
   */
  static async storeData(request: StoreDataRequest): Promise<StoreDataResponse> {
    return apiRequest<StoreDataResponse>("post", `${this.BASE_PATH}/create`, request);
  }

  /**
   * Store data for EVM to Stellar flow
   * @param data The EVM to Stellar flow data
   * @returns Success message
   */
  static async storeEvmToStellarData(
    data: Omit<EvmToStellarStorageRequest, "flowType" | "timestamp">
  ): Promise<StoreDataResponse> {
    const request: EvmToStellarStorageRequest = {
      ...data,
      flowType: OfframpHandlerType.EVM_TO_STELLAR,
      timestamp: new Date().toISOString()
    };
    return this.storeData(request);
  }

  /**
   * Store data for Assethub to Stellar flow
   * @param data The Assethub to Stellar flow data
   * @returns Success message
   */
  static async storeAssethubToStellarData(
    data: Omit<AssethubToStellarStorageRequest, "flowType" | "timestamp">
  ): Promise<StoreDataResponse> {
    const request: AssethubToStellarStorageRequest = {
      ...data,
      flowType: OfframpHandlerType.ASSETHUB_TO_STELLAR,
      timestamp: new Date().toISOString()
    };
    return this.storeData(request);
  }

  /**
   * Store data for EVM to BRLA flow
   * @param data The EVM to BRLA flow data
   * @returns Success message
   */
  static async storeEvmToBrlaData(data: Omit<EvmToBrlaStorageRequest, "flowType" | "timestamp">): Promise<StoreDataResponse> {
    const request: EvmToBrlaStorageRequest = {
      ...data,
      flowType: OfframpHandlerType.EVM_TO_BRLA,
      timestamp: new Date().toISOString()
    };
    return this.storeData(request);
  }

  /**
   * Store data for Assethub to BRLA flow
   * @param data The Assethub to BRLA flow data
   * @returns Success message
   */
  static async storeAssethubToBrlaData(
    data: Omit<AssethubToBrlaStorageRequest, "flowType" | "timestamp">
  ): Promise<StoreDataResponse> {
    const request: AssethubToBrlaStorageRequest = {
      ...data,
      flowType: OfframpHandlerType.ASSETHUB_TO_BRLA,
      timestamp: new Date().toISOString()
    };
    return this.storeData(request);
  }

  /**
   * Store data for BRLA to EVM flow
   * @param data The BRLA to EVM flow data
   * @returns Success message
   */
  static async storeBrlaToEvmData(data: Omit<BrlaToEvmStorageRequest, "flowType" | "timestamp">): Promise<StoreDataResponse> {
    const request: BrlaToEvmStorageRequest = {
      ...data,
      flowType: OnrampHandlerType.BRLA_TO_EVM,
      timestamp: new Date().toISOString()
    };
    return this.storeData(request);
  }

  /**
   * Store data for BRLA to Assethub flow
   * @param data The BRLA to Assethub flow data
   * @returns Success message
   */
  static async storeBrlaToAssethubData(
    data: Omit<BrlaToAssethubStorageRequest, "flowType" | "timestamp">
  ): Promise<StoreDataResponse> {
    const request: BrlaToAssethubStorageRequest = {
      ...data,
      flowType: OnrampHandlerType.BRLA_TO_ASSETHUB,
      timestamp: new Date().toISOString()
    };
    return this.storeData(request);
  }
}
