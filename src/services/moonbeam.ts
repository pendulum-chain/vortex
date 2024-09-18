import { u8aToHex } from '@polkadot/util';
import { decodeAddress } from '@polkadot/util-crypto';
import { Keyring } from '@polkadot/api';
import { http, createConfig, readContract, waitForTransactionReceipt } from '@wagmi/core';
import { moonbeam } from '@wagmi/core/chains';

import { OfframpingState } from './offrampingFlow';
import encodePayload from './squidrouter/payload';
import { getApiManagerInstance } from './polkadot/polkadotApi';
import { SIGNING_SERVICE_URL } from '../constants/constants';
import squidReceiverABI from '../../mooncontracts/splitReceiverABI.json';
import { squidRouterConfig } from './squidrouter/config';
import { waitUntilTrue } from '../helpers/function';
import Big from 'big.js';
import { getRawInputBalance } from './polkadot/ephemeral';

export const moonbeamConfig = createConfig({
  chains: [moonbeam],
  transports: {
    [moonbeam.id]: http(),
  },
});

export async function executeXCM(state: OfframpingState): Promise<OfframpingState> {
  const pendulumApiComponents = await getApiManagerInstance();
  const apiData = pendulumApiComponents.apiData!;

  const keyring = new Keyring({ type: 'sr25519', ss58Format: apiData.ss58Format });
  const ephemeralKeypair = keyring.addFromUri(state.pendulumEphemeralSeed);

  const pendulumEphemeralAccountHex = u8aToHex(decodeAddress(ephemeralKeypair.address));
  const squidRouterPayload = encodePayload(pendulumEphemeralAccountHex);

  const response = await fetch(`${SIGNING_SERVICE_URL}/v1/moonbeam/execute-xcm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: state.squidRouterReceiverId, payload: squidRouterPayload }),
  });

  if (!response.ok) {
    throw new Error(`Error while executing XCM: ${response.statusText}`);
  }

  let hash;
  try {
    hash = (await response.json()).hash;
    await waitForTransactionReceipt(moonbeamConfig, hash);
  } catch (error) {
    throw new Error(`Error while executing XCM: Could not fetch transaction receipt for hash : ${hash}`);
  }

  await waitUntilTrue(async () => {
    const inputBalanceRaw = await getRawInputBalance(state);
    return inputBalanceRaw.gt(Big(0));
  }, 5000);

  return { ...state, phase: 'subsidizePreSwap' };
}

export async function isHashRegistered(hash: `0x${string}`): Promise<boolean> {
  const result = (await readContract(moonbeamConfig, {
    abi: squidReceiverABI,
    chainId: moonbeam.id,
    address: squidRouterConfig.receivingContractAddress,
    functionName: 'xcmDataMapping',
    args: [hash],
  })) as bigint;

  return result > 0n;
}
