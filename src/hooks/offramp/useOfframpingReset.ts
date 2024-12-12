import { StateUpdater, useCallback } from 'preact/hooks';

import { clearOfframpingState, OfframpingState } from '../../services/offrampingFlow';
import { IAnchorSessionParams, ISep24Intermediate } from '../../services/anchor';
import { SigningPhase } from './useMainProcess';
import { ExtendedExecutionInput } from './useSEP24/useSEP24State';

export const useOfframpingReset = (deps: {
  setOfframpingState: StateUpdater<OfframpingState | undefined>;
  setOfframpingStarted: StateUpdater<boolean>;
  setIsInitiating: StateUpdater<boolean>;
  setAnchorSessionParams: (params: IAnchorSessionParams | undefined) => void;
  setFirstSep24Response: (response: ISep24Intermediate | undefined) => void;
  setExecutionInput: (input: ExtendedExecutionInput | undefined) => void;
  cleanSep24FirstVariables: () => void;
  setSigningPhase: StateUpdater<SigningPhase | undefined>;
}) => {
  const resetOfframpingState = useCallback(() => {
    deps.setAnchorSessionParams(undefined);
    deps.setFirstSep24Response(undefined);
    deps.setExecutionInput(undefined);
    deps.setOfframpingState(undefined);
    deps.setSigningPhase(undefined);
    deps.setOfframpingStarted(false);
    deps.setIsInitiating(false);
    deps.cleanSep24FirstVariables();
    clearOfframpingState();
  }, [deps]);

  return resetOfframpingState;
};
