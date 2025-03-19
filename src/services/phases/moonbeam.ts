import { http, createConfig, readContract, waitForTransactionReceipt } from '@wagmi/core';
import { moonbeam } from '@wagmi/core/chains';
import Big from 'big.js';

import { decodeAddress, mnemonicGenerate } from '@polkadot/util-crypto';
import { u8aToHex } from '@polkadot/util';
import { ApiPromise, Keyring } from '@polkadot/api';

import squidReceiverABI from '../../../mooncontracts/splitReceiverABI.json';
import { SIGNING_SERVICE_URL } from '../../constants/constants';
import { waitUntilTrue } from '../../helpers/function';
import encodePayload from './squidrouter/payload';
import { OfframpingState } from '../offrampingFlow';
import { ExecutionContext } from '../flowCommons';

import { getRawInputBalance } from './polkadot/ephemeral';
import { squidRouterConfigBase } from './squidrouter/config';
import { SignerOptions, SubmittableExtrinsic } from '@polkadot/api-base/types';
import { ISubmittableResult } from '@polkadot/types/types';

export const moonbeamConfig = createConfig({
  chains: [moonbeam],
  transports: {
    [moonbeam.id]: http(),
  },
});

export async function createMoonbeamEphemeralSeed(moonbeamNode: {
  ss58Format: number;
  api: ApiPromise;
  decimals: number;
}) {
  const seedPhrase = mnemonicGenerate();

  if (!moonbeamNode) {
    throw new Error('Pendulum node not available');
  }

  const keyring = new Keyring({ type: 'ethereum' });

  const ephemeralAccountKeypair = keyring.addFromUri(seedPhrase);

  console.log('Moonbeam ephemeral account created:', ephemeralAccountKeypair.address);

  return { seed: seedPhrase, address: ephemeralAccountKeypair.address };
}

export async function createMoonbeamToPendulumXCM(
  moonbeamApi: ApiPromise,
  receiverAddress: string,
  rawAmount: string,
  assetAccounKey: string,
  moonbeamEphemeralSeed: string,
  nonce = -1,
): Promise<SubmittableExtrinsic<'promise', ISubmittableResult>> {
  const receiverAccountHex = u8aToHex(decodeAddress(receiverAddress));

  const keyring = new Keyring({ type: 'ethereum' });
  const ephemeralKeypair = keyring.addFromUri(moonbeamEphemeralSeed);

  const destination = { V3: { parents: 1, interior: { X1: { Parachain: 2094 } } } };
  const beneficiary = {
    V3: { parents: 0, interior: { X1: { AccountId32: { network: undefined, id: receiverAccountHex } } } },
  };
  const assets = {
    V3: [
      {
        id: {
          Concrete: {
            parents: 0,
            interior: { X2: [{ PalletInstance: 110 }, { AccountKey20: { network: undefined, key: assetAccounKey } }] },
          },
        },
        fun: { Fungible: rawAmount },
      },
    ],
  };
  const feeAssetItem = 0;
  const weightLimit = 'Unlimited';

  const xcm = moonbeamApi.tx.polkadotXcm.transferAssets(destination, beneficiary, assets, feeAssetItem, weightLimit);

  const options: Partial<SignerOptions> = { nonce };
  options.era = 0;

  const signedXcm = await xcm.signAsync(ephemeralKeypair, options);
  return signedXcm;
}

export async function executeMoonbeamToPendulumXCM(
  state: OfframpingState,
  context: ExecutionContext,
): Promise<OfframpingState> {
  const { pendulumNode } = context;

  const { ss58Format } = pendulumNode;

  const keyring = new Keyring({ type: 'sr25519', ss58Format });
  const ephemeralKeypair = keyring.addFromUri(state.pendulumEphemeralSeed);

  const pendulumEphemeralAccountHex = u8aToHex(decodeAddress(ephemeralKeypair.address));
  const squidRouterPayload = encodePayload(pendulumEphemeralAccountHex);

  const didInputTokenArrivedOnPendulum = async () => {
    const inputBalanceRaw = await getRawInputBalance(state, context);
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
        // will ensure that this function `executeMoonbeamToPendulumXCM` will be called again shortly after
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
    address: squidRouterConfigBase.receivingContractAddress,
    functionName: 'xcmDataMapping',
    args: [hash],
  })) as bigint;

  return result > 0n;
}
