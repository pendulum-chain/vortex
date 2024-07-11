import { useEffect } from 'react';
import { storageService } from '../services/localStorage';
import { ExecutionInput, OperationStatus } from '../types';
import Big from 'big.js';
import { storageKeys } from '../constants/localStorage';
import { Sep24Result } from '../services/anchor';
import { IAnchorSessionParams } from '../services/anchor';
import { StellarOperations } from '../services/stellar';
import { recoverEphemeralAccount } from '../services/polkadot/ephemeral';

// Hook to eventually read all relevant values from the local storage
// and load into app state.
export function useRecovery(
  setStatus: (status: OperationStatus) => void,
  setExecutionInput: (input: ExecutionInput | undefined) => void,
  setTokenBridgedAmount: (amount: Big | null) => void,
  setSep24Result: (result: Sep24Result | null) => void,
  setAnchorSessionParams: (params: IAnchorSessionParams | null) => void,
  setStellarOperations: (operations: StellarOperations | null) => void,
): boolean {
  const currentOfframpStatus = storageService.getParsed<OperationStatus>(storageKeys.OFFRAMP_STATUS);
  const isRecovery = currentOfframpStatus !== undefined;

  useEffect(() => {
    if (!isRecovery) {
      return;
    }

    setStatus(currentOfframpStatus);
    setExecutionInput(storageService.getParsed<ExecutionInput>(storageKeys.OFFRAMP_EXECUTION_INPUTS));
    setTokenBridgedAmount(storageService.getBig(storageKeys.TOKEN_BRIDGED_AMOUNT)!);
    // TODO need to do some error handling here in case one is undefined, which should not happen but...
    setSep24Result(storageService.getParsed<Sep24Result>(storageKeys.SEP24_RESULT)!);
    setAnchorSessionParams(storageService.getParsed<IAnchorSessionParams>(storageKeys.ANCHOR_SESSION_PARAMS)!);
    setStellarOperations(storageService.getParsed<StellarOperations>(storageKeys.STELLAR_OPERATIONS)!);

    if (
      !currentOfframpStatus ||
      !storageService.getParsed<ExecutionInput>(storageKeys.OFFRAMP_EXECUTION_INPUTS) ||
      !storageService.getBig(storageKeys.TOKEN_BRIDGED_AMOUNT) ||
      !storageService.getParsed<Sep24Result>(storageKeys.SEP24_RESULT) ||
      !storageService.getParsed<IAnchorSessionParams>(storageKeys.ANCHOR_SESSION_PARAMS) ||
      !storageService.getParsed<StellarOperations>(storageKeys.STELLAR_OPERATIONS)
    ) {
      console.error('Error: One or more recovery parameters are undefined.');
    }

    // Recover ephemerals 
    // If the bridge was executed, we expect the ephemeral to have funds, or at least use the same since it is coded on the destination
    // payload.
    if (currentOfframpStatus >= OperationStatus.BridgeExecuted) {
      recoverEphemeralAccount();
    }
    // DOING recover stellar......

    console.log('Current status: ', currentOfframpStatus);
  }, [
    setStatus,
    setExecutionInput,
    setTokenBridgedAmount,
    setSep24Result,
    setAnchorSessionParams,
    setStellarOperations,
  ]);

  return isRecovery;
}

export default useRecovery;
