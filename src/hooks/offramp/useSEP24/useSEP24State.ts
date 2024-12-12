import { useState, useRef, StateUpdater, MutableRefObject } from 'preact/compat';
import Big from 'big.js';

import { IAnchorSessionParams, ISep24Intermediate } from '../../../services/anchor';
import { InputTokenType, OutputTokenType } from '../../../constants/tokenConfig';

import { ExecutionInput } from '../useMainProcess';

export type ExtendedExecutionInput = ExecutionInput & { stellarEphemeralSecret: string };

export interface UseSEP24StateReturn {
  anchorSessionParams: IAnchorSessionParams | undefined;
  firstSep24Response: ISep24Intermediate | undefined;
  executionInput: ExtendedExecutionInput | undefined;
  setAnchorSessionParams: (params: IAnchorSessionParams | undefined) => void;
  setFirstSep24Response: (response: ISep24Intermediate | undefined) => void;
  setExecutionInput: (input: ExtendedExecutionInput | undefined) => void;
  firstSep24IntervalRef: MutableRefObject<number | undefined>;
}

export const useSEP24State = (): UseSEP24StateReturn => {
  const [anchorSessionParams, setAnchorSessionParams] = useState<IAnchorSessionParams>();
  const [firstSep24Response, setFirstSep24Response] = useState<ISep24Intermediate>();
  const [executionInput, setExecutionInput] = useState<ExtendedExecutionInput>();
  const firstSep24IntervalRef = useRef<number>();

  return {
    anchorSessionParams,
    setAnchorSessionParams,

    firstSep24Response,
    setFirstSep24Response,

    executionInput,
    setExecutionInput,

    firstSep24IntervalRef,
  };
};
