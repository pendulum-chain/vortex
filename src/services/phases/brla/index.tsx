import Big from 'big.js';
import { SIGNING_SERVICE_URL } from '../../../constants/constants';
import { OfframpingState } from '../../offrampingFlow';
import { fetchOfframpStatus } from '../../signingService';

export async function performBrlaPayoutOnMoonbeam(state: OfframpingState): Promise<OfframpingState> {
  // Must confirm, token has arrived on Moonbeam
  // For simplicity let's say we wait 2 minutes

  const { taxId, pixDestination, outputAmount } = state;

  if (!taxId || !pixDestination || !outputAmount) {
    return { ...state, failure: { type: 'unrecoverable', message: 'Missing required parameters on state' } };
  }

  const amount = new Big(outputAmount.units).mul(100); // BRLA understands raw amount with 2 decimal places.

  console.log(
    'performBrlaPayoutOnMoonbeam: Triggering offramp with taxId: ',
    taxId,
    ' pixDestination: ',
    pixDestination,
    ' amount: ',
    amount.toString(),
  );
  const response = await fetch(`${SIGNING_SERVICE_URL}/v1/brla/triggerOfframp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ taxId, pixKey: pixDestination, amount: amount.toString() }),
  });
  if (response.status !== 200) {
    throw new Error(`Failed request BRLA offramp from server: ${response.statusText}`);
  }

  while (true) {
    await new Promise((resolve) => setTimeout(resolve, 10000));
    try {
      const eventStatus = await fetchOfframpStatus(taxId);
      if (eventStatus.type === 'MONEY-TRANSFER') {
        console.log(`Received money transfer event: ${JSON.stringify(eventStatus)}`);
        break;
      }
    } catch (err) {
      const error = err as Error;
      // we assume backend is temporarily unavailable. Operation should not fail.
      console.error('Error while fetching offramp status:', error.message);
    }
  }

  return {
    ...state,
    phase: 'pendulumCleanup',
  };
}
