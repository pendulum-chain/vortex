import { Keyring } from '@polkadot/api';

import { ExecutionContext, OfframpingState } from '../../../offrampingFlow';
import { waitUntilTrue } from '../../../../helpers/function';

import { submitSignedXcm } from '.';
import { SignerOptions } from '@polkadot/api-base/types';
import { decodeSubmittableExtrinsic } from '../../signedTransactions';
import Big from 'big.js';

export function createPendulumToMoonbeamTransfer(
  context: ExecutionContext,
  destinationAddress: string,
  rawAmount: string,
  pendulumEphemeralSeed: string,
  nonce = -1,
) {
  const currencyId = { XCM: 13 };
  const destination = { V2: { parents: 1, interior: { X2: { AccountKey20: destinationAddress, Parachain: 2004 } } } };
  const { pendulumNode } = context;
  const { ss58Format, api: pendulumApi } = pendulumNode;

  // get ephemeral keypair and account
  const keyring = new Keyring({ type: 'sr25519', ss58Format });
  const ephemeralKeypair = keyring.addFromUri(pendulumEphemeralSeed);

  const options: Partial<SignerOptions> = { nonce };
  options.era = 0;
  return pendulumApi.tx.xTokens
    .transfer(currencyId, rawAmount, destination, 'Unlimited')
    .signAsync(ephemeralKeypair, options);
}

export async function executePendulumToMoonbeamXCM(
  state: OfframpingState,
  context: ExecutionContext,
): Promise<OfframpingState> {
  const { pendulumNode } = context;
  const { pendulumEphemeralAddress, transactions, outputAmount } = state;

  if (transactions === undefined || transactions.pendulumToMoonbeamXcmTransaction) {
    const message = 'Missing transactions for xcm to Moonbeam';
    console.error(message);
    return { ...state, failure: { type: 'unrecoverable', message } };
  }

  const redeemExtrinsic = decodeSubmittableExtrinsic(transactions!.pendulumToMoonbeamXcmTransaction!, pendulumNode.api);
  const { event, hash } = await submitSignedXcm(pendulumEphemeralAddress, redeemExtrinsic);

  const didInputTokenArrivedOnMoonbeam = async () => {
    const inputBalanceRaw = await getMoonbeamRawInputBalance(state, context);
    return inputBalanceRaw.eq(new Big(outputAmount.raw));
  };

  await waitUntilTrue(didInputTokenArrivedOnMoonbeam, 1000);

  return { ...state, phase: 'performBrlaPayoutOnMoonbeam' };
}

export async function getMoonbeamRawInputBalance(state: OfframpingState, context: ExecutionContext): Promise<Big> {
  //TODO implement
  return new Big(0);
}
