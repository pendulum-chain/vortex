import { ApiPromise, Keyring } from '@polkadot/api';

import { BrlaOfframpTransactions, ExecutionContext, OfframpingState } from '../../../offrampingFlow';

import { submitXTokens } from '.';
import { SignerOptions } from '@polkadot/api-base/types';
import { decodeSubmittableExtrinsic, encodeSubmittableExtrinsic } from '../../signedTransactions';
import { isBrlaOfframpTransactions } from '../../../../types/offramp';
import { ApiComponents } from '../../../../contexts/polkadotNode';
import { MOONBEAM_XCM_FEE_GLMR } from '../../../../constants/constants';

// We send a fixed fee amount of 0.05 GLMR.
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
      interior: { X2: [{ Parachain: 2004 }, { AccountKey20: { key: destinationAddress, network: 'Any' } }] },
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
        [currencyFeeId, MOONBEAM_XCM_FEE_GLMR], // TODO must be fetched.
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

  const { hash } = await submitXTokens(pendulumEphemeralAddress, xcmExtrinsic);
  state.pendulumToMoonbeamXcmHash = hash as `0x${string}`;

  return { ...state, phase: 'performBrlaPayoutOnMoonbeam' };
}
