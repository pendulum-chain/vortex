import { OfframpingState } from '../../offrampingFlow';

export async function performBrlaPayoutOnMoonbeam(state: OfframpingState): Promise<OfframpingState> {
  return {
    ...state,
    phase: 'success',
  };
}
