import {
  AssethubToBrlaStorageRequest,
  BrlaToAssethubStorageRequest,
  BrlaToEvmStorageRequest,
  EvmToBrlaStorageRequest,
  OfframpHandlerType,
  OnrampHandlerType,
  StoreDataRequest,
  StoreDataResponse
} from "@vortexfi/shared";
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
