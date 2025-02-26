import Big from 'big.js';
import { createPublicClient, http } from 'viem';
import { moonbeam } from 'viem/chains';

import { SIGNING_SERVICE_URL } from '../../../constants/constants';
import { OfframpingState } from '../../offrampingFlow';
import { fetchOfframpStatus } from '../../signingService';
import erc20ABI from '../../../contracts/ERC20';
import { getOutputTokenDetailsMoonbeam } from '../../../constants/tokenConfig';

export async function performBrlaPayoutOnMoonbeam(state: OfframpingState): Promise<OfframpingState> {
  const { taxId, pixDestination, outputAmount, brlaEvmAddress, outputTokenType } = state;

  if (!taxId || !pixDestination || !outputAmount || !brlaEvmAddress) {
    return { ...state, failure: { type: 'unrecoverable', message: 'Missing required parameters on state' } };
  }

  const tokenDetails = getOutputTokenDetailsMoonbeam(outputTokenType);

  const moonbeamPollingTimeMs = 1000;
  const maxWaitingTimeMs = 5 * 60 * 1000; // 5 minutes

  try {
    await checkMoonbeamBalancePeriodically(
      tokenDetails.moonbeamErc20Address,
      brlaEvmAddress,
      outputAmount.raw,
      moonbeamPollingTimeMs,
      maxWaitingTimeMs,
    );
  } catch (balanceCheckError) {
    if (balanceCheckError instanceof Error) {
      if (balanceCheckError.message === 'Balance did not meet the limit within the specified time') {
        return { ...state, failure: { type: 'unrecoverable', message: balanceCheckError.message } };
      } else {
        console.log('Error checking Moonbeam balance:', balanceCheckError);
        throw new Error(`Error checking Moonbeam balance`);
      }
    }
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

export function checkMoonbeamBalancePeriodically(
  tokenAddress: string,
  brlaEvmAddress: string,
  amountDesiredRaw: string,
  intervalMs: number,
  timeoutMs: number,
) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const intervalId = setInterval(async () => {
      try {
        const publicClient = createPublicClient({
          chain: moonbeam,
          transport: http(),
        });

        const result = (await publicClient.readContract({
          address: tokenAddress,
          abi: erc20ABI,
          functionName: 'balanceOf',
          args: [brlaEvmAddress],
        })) as String;

        console.log(`Moonbeam balance check: ${result.toString()} / ${amountDesiredRaw.toString()}`);
        const someBalanceBig = new Big(result.toString());
        const amountDesiredUnitsBig = new Big(amountDesiredRaw);

        if (someBalanceBig.gte(amountDesiredUnitsBig)) {
          clearInterval(intervalId);
          resolve(someBalanceBig);
        } else if (Date.now() - startTime > timeoutMs) {
          clearInterval(intervalId);
          reject(new Error(`Balance did not meet the limit within the specified time (${timeoutMs} ms)`));
        }
      } catch (error) {
        clearInterval(intervalId);
        reject(new Error(`Error checking balance: ${error}`));
      }
    }, intervalMs);
  });
}
