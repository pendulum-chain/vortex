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

  const didInputTokenArrivedOnPendulum = async () => {
    const inputBalanceRaw = await getRawInputBalance(state);
    return inputBalanceRaw.gt(Big(0));
  };

  if (!(await didInputTokenArrivedOnPendulum())) {
    let { moonbeamXcmTransactionHash } = state;

    if (moonbeamXcmTransactionHash === undefined) {
      const response = await fetch(`${SIGNING_SERVICE_URL}/v1/moonbeam/execute-xcm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: state.squidRouterReceiverId, payload: squidRouterPayload }),
      });

      if (!response.ok) {
        throw new Error(`Error while executing XCM: ${response.statusText}`);
      }

      try {
        moonbeamXcmTransactionHash = (await response.json()).hash;

        // We want to store the `moonbeamXcmTransactionHash` immediately in the local storage
        // and not just after this function call here would usually end (i.e. after the
        // tokens arrived on Pendulum).
        // For that reason we return early here and the outer logic of the `useMainProcess` hook
        // will ensure that this function `executeXCM` will be called again shortly after
        // where this time `moonbeamXcmTransactionHash` is already defined right at the beginning
        // of the call
        return { ...state, moonbeamXcmTransactionHash };
      } catch (error) {
        throw new Error(
          `Error while executing XCM: Could not fetch transaction receipt for hash : ${moonbeamXcmTransactionHash}`,
        );
      }
    }

    await waitForTransactionReceipt(moonbeamConfig, { hash: moonbeamXcmTransactionHash, chainId: moonbeam.id });
    await waitUntilTrue(didInputTokenArrivedOnPendulum, 5000);
  }

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
