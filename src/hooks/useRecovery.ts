import { useEffect } from 'react';
import { storageService } from '../services/localStorage';
import { ExecutionInput, OperationStatus } from '../types';
import Big from 'big.js';
import { storageKeys } from '../constants/localStorage';
import { SepResult } from '../services/anchor';
import { IAnchorSessionParams } from '../services/anchor';
import { StellarOperations } from '../services/stellar';
import { recoverEphemeralAccount } from '../services/polkadot/ephemeral';
import { restoreStellarEphemeralKeys } from '../services/anchor';

export type RecoveryHookResult = {
  isRecovery: boolean;
  isRecoveryError: boolean;
};

// Hook to eventually read all relevant values from the local storage
// and load into app state.
export function useRecovery(
  setStatus: (status: OperationStatus) => void,
  setExecutionInput: (input: ExecutionInput | undefined) => void,
  setTokenBridgedAmount: (amount: Big | null) => void,
  setSepResult: (result: SepResult | null) => void,
  setAnchorSessionParams: (params: IAnchorSessionParams | null) => void,
  setStellarOperations: (operations: StellarOperations | null) => void,
): RecoveryHookResult {
  const currentOfframpStatus = storageService.getParsed<OperationStatus>(storageKeys.OFFRAMP_STATUS);
  const isRecovery = currentOfframpStatus ? true : false;
  let isRecoveryError = false;

  useEffect(() => {
    if (!isRecovery) {
      return;
    }

    // currentOfframpStatus! is safe because we are checking isRecovery. By isRecovery definition, we know it is not undefined.

    // Need to recover corresponding states depending on the current status
    // TODO need to do some error handling here in case one is undefined, which should not happen but...

    // At this point we should also have the stellar ephemeral (sep10), yet it is not strictly necessary to use the same, but we
    // are not redoing the sep10.
    if (currentOfframpStatus! >= OperationStatus.Sep10Completed) {
      setExecutionInput(storageService.getParsed<ExecutionInput>(storageKeys.OFFRAMP_EXECUTION_INPUTS));
      restoreStellarEphemeralKeys();
      setAnchorSessionParams(storageService.getParsed<IAnchorSessionParams>(storageKeys.ANCHOR_SESSION_PARAMS)!);
    }

    if (currentOfframpStatus! >= OperationStatus.SepCompleted) {
      setSepResult(storageService.getParsed<SepResult>(storageKeys.SEP_RESULT)!);
    }

    if (currentOfframpStatus! >= OperationStatus.PendulumEphemeralReady) {
      setTokenBridgedAmount(storageService.getBig(storageKeys.TOKEN_BRIDGED_AMOUNT)!);
    }

    if (currentOfframpStatus! >= OperationStatus.StellarEphemeralReady) {
      setStellarOperations(storageService.getParsed<StellarOperations>(storageKeys.STELLAR_OPERATIONS)!);
    }

    // Recover ephemerals
    // If the bridge was executed, we expect the ephemeral to have funds, or at least use the same since it is coded on the destination
    // payload.
    if (currentOfframpStatus! >= OperationStatus.BridgeExecuted) {
      try {
        recoverEphemeralAccount();
      } catch {
        isRecoveryError = true;
        console.error('Error: Failed to recover ephemerals');
      }
    }

    setStatus(currentOfframpStatus!);

    console.log('Current status: ', currentOfframpStatus);
  }, [
    isRecovery,
    setStatus,
    setExecutionInput,
    setTokenBridgedAmount,
    setSepResult,
    setAnchorSessionParams,
    setStellarOperations,
  ]);

  return {
    isRecovery,
    isRecoveryError,
  };
}

export function clearLocalStorageKeys(storageKeys: any) {
  Object.values(storageKeys).forEach((key) => {
    storageService.remove(key as string);
  });
}

export default useRecovery;
