export namespace StorageEndpoints {
  // Flow types for storage
  export enum OfframpHandlerType {
    EVM_TO_STELLAR = 'evm-to-stellar',
    ASSETHUB_TO_STELLAR = 'assethub-to-stellar',
    EVM_TO_BRLA = 'evm-to-brla',
    ASSETHUB_TO_BRLA = 'assethub-to-brla',
  }

  export enum OnrampHandlerType {
    BRLA_TO_EVM = 'brla-to-evm',
    BRLA_TO_ASSETHUB = 'brla-to-assethub',
  }

  export type FlowType = OfframpHandlerType | OnrampHandlerType;

  // Common fields for all storage requests
  export interface StorageRequestBase {
    flowType: FlowType;
    timestamp: string;
    pendulumEphemeralPublicKey: string;
    nablaApprovalTx: string;
    nablaSwapTx: string;
    inputAmount: string;
    inputTokenType: string;
    outputAmount: string;
    outputTokenType: string;
  }

  // Specific fields for each flow type
  export interface EvmToStellarStorageRequest extends StorageRequestBase {
    flowType: OfframpHandlerType.EVM_TO_STELLAR;
    offramperAddress: string;
    squidRouterReceiverId: string;
    squidRouterReceiverHash: string;
  }

  export interface AssethubToStellarStorageRequest extends StorageRequestBase {
    flowType: OfframpHandlerType.ASSETHUB_TO_STELLAR;
    offramperAddress: string;
    stellarEphemeralPublicKey: string;
    spacewalkRedeemTx: string;
    stellarOfframpTx: string;
    stellarCleanupTx: string;
  }

  export interface EvmToBrlaStorageRequest extends StorageRequestBase {
    flowType: OfframpHandlerType.EVM_TO_BRLA;
    offramperAddress: string;
    squidRouterReceiverId: string;
    squidRouterReceiverHash: string;
    pendulumToMoonbeamXcmTx: string;
  }

  export interface AssethubToBrlaStorageRequest extends StorageRequestBase {
    flowType: OfframpHandlerType.ASSETHUB_TO_BRLA;
    offramperAddress: string;
    pendulumToMoonbeamXcmTx: string;
  }

  export interface BrlaToEvmStorageRequest extends StorageRequestBase {
    flowType: OnrampHandlerType.BRLA_TO_EVM;
    moonbeamToPendulumXcmTx: string;
    pendulumToMoonbeamXcmTx: string;
    squidRouterApproveTx: string;
    squidRouterSwapTx: string;
  }

  export interface BrlaToAssethubStorageRequest extends StorageRequestBase {
    flowType: OnrampHandlerType.BRLA_TO_ASSETHUB;
    moonbeamToPendulumXcmTx: string;
    pendulumToAssetHubXcmTx: string;
  }

  // Union type for all storage requests
  export type StoreDataRequest =
    | EvmToStellarStorageRequest
    | AssethubToStellarStorageRequest
    | EvmToBrlaStorageRequest
    | AssethubToBrlaStorageRequest
    | BrlaToEvmStorageRequest
    | BrlaToAssethubStorageRequest;

  // POST /storage/create
  export interface StoreDataResponse {
    message: string;
  }

  export interface StoreDataErrorResponse {
    error: string;
    details?: string;
  }
}
