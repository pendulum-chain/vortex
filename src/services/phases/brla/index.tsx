import Big from 'big.js';
import { SIGNING_SERVICE_URL } from '../../../constants/constants';
import { OfframpingState } from '../../offrampingFlow';

export async function performBrlaPayoutOnMoonbeam(state: OfframpingState): Promise<OfframpingState> {
  // Must confirm, token has arrived on Moonbeam
  // For simplicity let's say we wait 2 minutes

  const { taxId, pixDestination, outputAmount } = state;

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

  // fetch until we get success or failure event
  let currentError = '';
  while (true) {
    await new Promise((resolve) => setTimeout(resolve, 10000));

    const statusResponse = await fetch(`${SIGNING_SERVICE_URL}/v1/brla/getOfframpStatus?taxId=${taxId}`);

    if (statusResponse.status !== 200) {
      if (statusResponse.status === 404) {
        currentError = 'Offramp not found';
      } else {
        currentError = `Failed to fetch offramp status from server: ${statusResponse.statusText}`;
      }
      continue;
    }

    const eventStatus = await statusResponse.json();
    console.log(`Received event status: ${JSON.stringify(eventStatus)}`);
    if (eventStatus.type === 'MONEY-TRANSFER') {
      console.log(`Received money transfer event: ${JSON.stringify(eventStatus)}`);
      break;
    }
  }

  return {
    ...state,
    phase: 'success',
  };
}
