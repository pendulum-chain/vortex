import { ApiPromise, Keyring } from '@polkadot/api';

import { ExecutionContext, OfframpingState } from '../../../offrampingFlow';

import { submitXcm } from '.';
import { SignerOptions } from '@polkadot/api-base/types';
import { decodeSubmittableExtrinsic } from '../../signedTransactions';
import { isBrlaOfframpTransactions } from '../../../../types/offramp';
import { ApiComponents } from '../../../../contexts/polkadotNode';

// Fee was 38,722,802,500,000,000 GLMR when testing
export function createPendulumToMoonbeamTransfer(
  pendulumNode: ApiComponents,
  destinationAddress: string,
  rawAmount: string,
  pendulumEphemeralSeed: string,
  nonce = -1,
) {
  const currencyId = { XCM: 13 };
  const currencyFeeId = { XCM: 6 };
  const destination = {
    V2: {
      parents: 1,
      interior: { X2: [{ AccountKey20: { key: destinationAddress, network: 'Any' } }, { Parachain: 2004 }] },
    },
  };
  const { ss58Format, api: pendulumApi } = pendulumNode;

  // get ephemeral keypair and account
  const keyring = new Keyring({ type: 'sr25519', ss58Format });
  const ephemeralKeypair = keyring.addFromUri(pendulumEphemeralSeed);

  const options: Partial<SignerOptions> = { nonce };
  options.era = 0;
  return pendulumApi.tx.xTokens
    .transferMulticurrencies(
      [
        [currencyId, rawAmount],
        [currencyFeeId, '38822802500000000'],
      ],
      1,
      destination,
      'Unlimited',
    )
    .signAsync(ephemeralKeypair, options);
}

export async function executePendulumToMoonbeamXCM(
  state: OfframpingState,
  context: ExecutionContext,
): Promise<OfframpingState> {
  const { pendulumNode } = context;
  const { pendulumEphemeralAddress, transactions, outputAmount } = state;

  if (transactions === undefined || !isBrlaOfframpTransactions(transactions)) {
    const message = 'Missing transactions for xcm to Moonbeam';
    console.error(message);
    return { ...state, failure: { type: 'unrecoverable', message } };
  }

  const xcmExtrinsic = decodeSubmittableExtrinsic(transactions.pendulumToMoonbeamXcmTransaction, pendulumNode.api);

  const { hash } = await submitXcm(pendulumEphemeralAddress, xcmExtrinsic);
  state.pendulumToMoonbeamXcmHash = hash as `0x${string}`;

  return { ...state, phase: 'performBrlaPayoutOnMoonbeam' };
}
