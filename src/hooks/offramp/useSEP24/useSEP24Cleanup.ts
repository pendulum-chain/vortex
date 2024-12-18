import { useCallback } from 'preact/compat';

import { UseSEP24StateReturn } from './useSEP24State';

export const useSEP24Cleanup = (sep24State: UseSEP24StateReturn) => {
  const { firstSep24IntervalRef, setFirstSep24Response, setExecutionInput, setAnchorSessionParams } = sep24State;

  return useCallback(() => {
    if (firstSep24IntervalRef.current !== undefined) {
      clearInterval(firstSep24IntervalRef.current);
      firstSep24IntervalRef.current = undefined;
      setFirstSep24Response(undefined);
      setExecutionInput(undefined);
      setAnchorSessionParams(undefined);
    }
  }, [firstSep24IntervalRef, setFirstSep24Response, setExecutionInput, setAnchorSessionParams]);
};
