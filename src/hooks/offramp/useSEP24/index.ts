import { StateUpdater } from 'preact/compat';
import Big from 'big.js';

import { InputTokenType, OutputTokenType } from '../../../constants/tokenConfig';

import { useSEP24State } from './useSEP24State';
import { useSEP24Cleanup } from './useSEP24Cleanup';
import { useAnchorWindowHandler } from './useAnchorWindowHandler';

export type SigningPhase = 'started' | 'approved' | 'signed' | 'finished';

export interface ExecutionInput {
  inputTokenType: InputTokenType;
  outputTokenType: OutputTokenType;
  amountInUnits: string;
  offrampAmount: Big;
  setInitializeFailed: StateUpdater<boolean>;
}

export const useSEP24 = () => {
  const sep24State = useSEP24State();
  const cleanSep24FirstVariables = useSEP24Cleanup(sep24State);
  const handleOnAnchorWindowOpen = useAnchorWindowHandler(sep24State, cleanSep24FirstVariables);

  return {
    ...sep24State,
    cleanSep24FirstVariables,
    handleOnAnchorWindowOpen,
  };
};
